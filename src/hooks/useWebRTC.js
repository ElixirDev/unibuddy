import { useRef, useCallback, useState, useEffect } from 'react';

// Enhanced ICE servers for better connectivity with many participants
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.stunprotocol.org:3478' },
  ],
  iceCandidatePoolSize: 10, // Pre-gather candidates for faster connections
};

// Bandwidth constraints for scalability
const VIDEO_CONSTRAINTS = {
  width: { ideal: 640, max: 1280 },
  height: { ideal: 480, max: 720 },
  frameRate: { ideal: 24, max: 30 }
};

export const useWebRTC = (wsRef, currentUserId) => {
  const peerConnections = useRef(new Map()); // odId -> RTCPeerConnection
  const remoteStreams = useRef(new Map()); // odId -> MediaStream
  const [remoteStreamMap, setRemoteStreamMap] = useState(new Map());
  const localStreamRef = useRef(null);
  const pendingCandidates = useRef(new Map());
  const makingOffer = useRef(new Map());
  const ignoreOffer = useRef(new Map());
  const connectionRetries = useRef(new Map()); // Track retry attempts
  const maxRetries = 3;

  // Cleanup on unmount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    return () => {
      // Cleanup on unmount - close all connections
      peerConnections.current.forEach(pc => pc.close());
      peerConnections.current.clear();
      remoteStreams.current.clear();
    };
  }, []);

  const setLocalStream = useCallback((stream) => {
    localStreamRef.current = stream;
    
    // Apply bandwidth constraints to video track
    const videoTrack = stream?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.applyConstraints(VIDEO_CONSTRAINTS).catch(console.warn);
    }
  }, []);

  const sendSignal = useCallback((type, targetId, payload) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'webrtc_signal',
        signalType: type,
        targetId,
        ...payload
      }));
    }
  }, [wsRef]);

  const createPeerConnection = useCallback((remoteUserId) => {
    if (peerConnections.current.has(remoteUserId)) {
      const existingPc = peerConnections.current.get(remoteUserId);
      if (existingPc.connectionState !== 'failed' && existingPc.connectionState !== 'closed') {
        return existingPc;
      }
      // Clean up failed connection
      existingPc.close();
      peerConnections.current.delete(remoteUserId);
    }

    console.log('Creating peer connection for:', remoteUserId);
    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Add local tracks to the connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Handle ICE candidates with batching for efficiency
    let candidateBuffer = [];
    let candidateTimeout = null;
    
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        candidateBuffer.push(event.candidate);
        
        // Batch send candidates every 100ms
        if (!candidateTimeout) {
          candidateTimeout = setTimeout(() => {
            candidateBuffer.forEach(candidate => {
              sendSignal('ice-candidate', remoteUserId, { candidate });
            });
            candidateBuffer = [];
            candidateTimeout = null;
          }, 100);
        }
      }
    };

    // Handle ICE connection state for reconnection
    pc.oniceconnectionstatechange = () => {
      console.log(`ICE state with ${remoteUserId}:`, pc.iceConnectionState);
      
      if (pc.iceConnectionState === 'disconnected') {
        // Try ICE restart
        setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected') {
            console.log('Attempting ICE restart for:', remoteUserId);
            pc.restartIce();
          }
        }, 2000);
      }
    };

    // Handle connection state changes with retry logic
    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${remoteUserId}:`, pc.connectionState);
      
      if (pc.connectionState === 'failed') {
        const retries = connectionRetries.current.get(remoteUserId) || 0;
        
        if (retries < maxRetries) {
          connectionRetries.current.set(remoteUserId, retries + 1);
          console.log(`Retrying connection to ${remoteUserId} (attempt ${retries + 1})`);
          
          // Close and recreate connection
          pc.close();
          peerConnections.current.delete(remoteUserId);
          remoteStreams.current.delete(remoteUserId);
          setRemoteStreamMap(new Map(remoteStreams.current));
          // Note: Retry will be handled by the participant reconnecting
        } else {
          console.error(`Max retries reached for ${remoteUserId}`);
          pc.close();
          peerConnections.current.delete(remoteUserId);
          remoteStreams.current.delete(remoteUserId);
          setRemoteStreamMap(new Map(remoteStreams.current));
        }
      } else if (pc.connectionState === 'connected') {
        connectionRetries.current.delete(remoteUserId);
      }
    };

    // Handle incoming tracks (remote video/audio/screen)
    pc.ontrack = (event) => {
      console.log('Received remote track from:', remoteUserId, event.track.kind);
      
      let stream = remoteStreams.current.get(remoteUserId);
      if (!stream) {
        stream = new MediaStream();
        remoteStreams.current.set(remoteUserId, stream);
      }
      
      // Add track if not already present
      if (!stream.getTracks().find(t => t.id === event.track.id)) {
        stream.addTrack(event.track);
        console.log('Added track to stream:', event.track.kind, event.track.id);
      }
      
      // Handle track ended
      event.track.onended = () => {
        console.log('Track ended:', event.track.kind, 'from:', remoteUserId);
        stream.removeTrack(event.track);
        setRemoteStreamMap(new Map(remoteStreams.current));
      };
      
      setRemoteStreamMap(new Map(remoteStreams.current));
    };

    // Handle negotiation needed (for adding/removing tracks)
    pc.onnegotiationneeded = async () => {
      if (pc.signalingState !== 'stable') return;
      
      try {
        makingOffer.current.set(remoteUserId, true);
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription(offer);
        sendSignal('offer', remoteUserId, { sdp: pc.localDescription });
      } catch (err) {
        console.error('Negotiation error:', err);
      } finally {
        makingOffer.current.set(remoteUserId, false);
      }
    };

    peerConnections.current.set(remoteUserId, pc);
    return pc;
  }, [sendSignal]);

  // Polite peer pattern
  const isPolite = useCallback((remoteUserId) => {
    return currentUserId < remoteUserId;
  }, [currentUserId]);

  // Initiate call to a remote user
  const callUser = useCallback(async (remoteUserId) => {
    if (isPolite(remoteUserId)) {
      console.log('Waiting for offer from:', remoteUserId, '(we are polite)');
      return;
    }

    const pc = createPeerConnection(remoteUserId);
    
    if (pc.signalingState !== 'stable' && pc.signalingState !== 'closed') {
      console.log('Already negotiating with:', remoteUserId);
      return;
    }

    try {
      makingOffer.current.set(remoteUserId, true);
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      if (pc.signalingState !== 'stable') {
        console.log('State changed during offer creation, aborting');
        return;
      }
      
      await pc.setLocalDescription(offer);
      sendSignal('offer', remoteUserId, { sdp: pc.localDescription });
      console.log('Sent offer to:', remoteUserId);
    } catch (err) {
      console.error('Error creating offer:', err);
    } finally {
      makingOffer.current.set(remoteUserId, false);
    }
  }, [createPeerConnection, sendSignal, isPolite]);

  // Handle incoming WebRTC signals
  const handleSignal = useCallback(async (data) => {
    const { signalType, senderId, sdp, candidate } = data;
    console.log('Received signal:', signalType, 'from:', senderId);

    const pc = createPeerConnection(senderId);
    const polite = isPolite(senderId);

    if (signalType === 'offer') {
      const offerCollision = makingOffer.current.get(senderId) || 
        (pc.signalingState !== 'stable' && pc.signalingState !== 'closed');
      
      ignoreOffer.current.set(senderId, !polite && offerCollision);
      
      if (ignoreOffer.current.get(senderId)) {
        console.log('Ignoring offer due to collision (we are impolite)');
        return;
      }

      try {
        if (pc.signalingState !== 'stable') {
          await Promise.all([
            pc.setLocalDescription({ type: 'rollback' }),
            pc.setRemoteDescription(new RTCSessionDescription(sdp))
          ]);
        } else {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        }
        
        // Process pending ICE candidates
        const pending = pendingCandidates.current.get(senderId) || [];
        for (const c of pending) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(c));
          } catch (e) {
            console.warn('Failed to add pending ICE candidate:', e);
          }
        }
        pendingCandidates.current.delete(senderId);
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal('answer', senderId, { sdp: pc.localDescription });
        console.log('Sent answer to:', senderId);
      } catch (err) {
        console.error('Error handling offer:', err);
      }
    } else if (signalType === 'answer') {
      try {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          
          const pending = pendingCandidates.current.get(senderId) || [];
          for (const c of pending) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(c));
            } catch (e) {
              console.warn('Failed to add pending ICE candidate:', e);
            }
          }
          pendingCandidates.current.delete(senderId);
        } else {
          console.log('Ignoring answer, not in have-local-offer state:', pc.signalingState);
        }
      } catch (err) {
        console.error('Error handling answer:', err);
      }
    } else if (signalType === 'ice-candidate') {
      try {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          if (!pendingCandidates.current.has(senderId)) {
            pendingCandidates.current.set(senderId, []);
          }
          pendingCandidates.current.get(senderId).push(candidate);
        }
      } catch (err) {
        console.warn('Error adding ICE candidate:', err);
      }
    }
  }, [createPeerConnection, sendSignal, isPolite]);

  // Add screen share track to all peer connections
  const addScreenShareTrack = useCallback((screenStream) => {
    if (!screenStream) return;
    
    const videoTrack = screenStream.getVideoTracks()[0];
    if (!videoTrack) return;

    peerConnections.current.forEach((pc, odId) => {
      try {
        pc.addTrack(videoTrack, screenStream);
        console.log('Added screen share track to peer:', odId);
      } catch (err) {
        console.error('Error adding screen share track:', err);
      }
    });
  }, []);

  // Remove screen share track from all peer connections
  const removeScreenShareTrack = useCallback((screenStream) => {
    if (!screenStream) return;
    
    const videoTrack = screenStream.getVideoTracks()[0];
    if (!videoTrack) return;

    peerConnections.current.forEach((pc, odId) => {
      try {
        const sender = pc.getSenders().find(s => s.track === videoTrack);
        if (sender) {
          pc.removeTrack(sender);
          console.log('Removed screen share track from peer:', odId);
        }
      } catch (err) {
        console.error('Error removing screen share track:', err);
      }
    });
  }, []);

  // Close connection with a specific user
  const closeConnection = useCallback((remoteUserId) => {
    const pc = peerConnections.current.get(remoteUserId);
    if (pc) {
      pc.close();
      peerConnections.current.delete(remoteUserId);
    }
    remoteStreams.current.delete(remoteUserId);
    makingOffer.current.delete(remoteUserId);
    ignoreOffer.current.delete(remoteUserId);
    pendingCandidates.current.delete(remoteUserId);
    connectionRetries.current.delete(remoteUserId);
    setRemoteStreamMap(new Map(remoteStreams.current));
  }, []);

  // Close all connections
  const closeAllConnections = useCallback(() => {
    peerConnections.current.forEach(pc => pc.close());
    peerConnections.current.clear();
    remoteStreams.current.clear();
    pendingCandidates.current.clear();
    makingOffer.current.clear();
    ignoreOffer.current.clear();
    connectionRetries.current.clear();
    setRemoteStreamMap(new Map());
  }, []);

  // Connect to all existing participants with staggered connections
  const connectToParticipants = useCallback((participantIds) => {
    participantIds.forEach((id, index) => {
      if (id !== currentUserId && !peerConnections.current.has(id)) {
        // Stagger connections to avoid overwhelming the network
        setTimeout(() => {
          callUser(id);
        }, index * 200); // 200ms delay between each connection
      }
    });
  }, [currentUserId, callUser]);

  // Get connection stats for a peer
  const getConnectionStats = useCallback(async (remoteUserId) => {
    const pc = peerConnections.current.get(remoteUserId);
    if (!pc) return null;
    
    try {
      const stats = await pc.getStats();
      let result = { bytesReceived: 0, bytesSent: 0, packetsLost: 0 };
      
      stats.forEach(report => {
        if (report.type === 'inbound-rtp') {
          result.bytesReceived += report.bytesReceived || 0;
          result.packetsLost += report.packetsLost || 0;
        } else if (report.type === 'outbound-rtp') {
          result.bytesSent += report.bytesSent || 0;
        }
      });
      
      return result;
    } catch (err) {
      return null;
    }
  }, []);

  return {
    remoteStreamMap,
    setLocalStream,
    handleSignal,
    callUser,
    closeConnection,
    closeAllConnections,
    connectToParticipants,
    addScreenShareTrack,
    removeScreenShareTrack,
    getConnectionStats
  };
};

export default useWebRTC;
