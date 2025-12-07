import { useRef, useCallback, useState } from 'react';

// Free STUN servers for NAT traversal
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ]
};

export const useWebRTC = (wsRef, currentUserId) => {
  const peerConnections = useRef(new Map()); // odId -> RTCPeerConnection
  const remoteStreams = useRef(new Map()); // odId -> MediaStream
  const [remoteStreamMap, setRemoteStreamMap] = useState(new Map());
  const localStreamRef = useRef(null);
  const pendingCandidates = useRef(new Map());
  const makingOffer = useRef(new Map()); // Track if we're making an offer
  const ignoreOffer = useRef(new Map()); // Track if we should ignore incoming offer

  const setLocalStream = useCallback((stream) => {
    localStreamRef.current = stream;
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
      return peerConnections.current.get(remoteUserId);
    }

    console.log('Creating peer connection for:', remoteUserId);
    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Add local tracks to the connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal('ice-candidate', remoteUserId, { candidate: event.candidate });
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${remoteUserId}:`, pc.connectionState);
      if (pc.connectionState === 'failed') {
        // Close and remove failed connection
        pc.close();
        peerConnections.current.delete(remoteUserId);
        remoteStreams.current.delete(remoteUserId);
        setRemoteStreamMap(new Map(remoteStreams.current));
      }
    };

    // Handle incoming tracks (remote video/audio/screen)
    pc.ontrack = (event) => {
      console.log('Received remote track from:', remoteUserId, event.track.kind, 'streams:', event.streams.length);
      
      // Use the stream from the event if available
      const incomingStream = event.streams[0];
      
      let stream = remoteStreams.current.get(remoteUserId);
      if (!stream) {
        stream = new MediaStream();
        remoteStreams.current.set(remoteUserId, stream);
      }
      
      // For video tracks, we might have multiple (camera + screen share)
      // Add the track without removing existing ones of the same kind
      if (!stream.getTracks().find(t => t.id === event.track.id)) {
        stream.addTrack(event.track);
        console.log('Added track to stream:', event.track.kind, event.track.id);
      }
      
      setRemoteStreamMap(new Map(remoteStreams.current));
    };

    peerConnections.current.set(remoteUserId, pc);
    return pc;
  }, [sendSignal]);

  // Polite peer: determine who should be "polite" based on ID comparison
  const isPolite = useCallback((remoteUserId) => {
    // The user with the "smaller" ID is polite and will yield in conflicts
    return currentUserId < remoteUserId;
  }, [currentUserId]);

  // Initiate call to a remote user (caller side)
  const callUser = useCallback(async (remoteUserId) => {
    // Only the "impolite" peer (larger ID) initiates the call
    // This prevents both peers from sending offers simultaneously
    if (isPolite(remoteUserId)) {
      console.log('Waiting for offer from:', remoteUserId, '(we are polite)');
      return;
    }

    const pc = createPeerConnection(remoteUserId);
    
    // Check if already connected or connecting
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
      
      // Check if state changed during async operation
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

  // Handle incoming WebRTC signals with polite peer pattern
  const handleSignal = useCallback(async (data) => {
    const { signalType, senderId, sdp, candidate } = data;
    console.log('Received signal:', signalType, 'from:', senderId);

    const pc = createPeerConnection(senderId);
    const polite = isPolite(senderId);

    if (signalType === 'offer') {
      // Handle offer collision (glare)
      const offerCollision = makingOffer.current.get(senderId) || 
        (pc.signalingState !== 'stable' && pc.signalingState !== 'closed');
      
      ignoreOffer.current.set(senderId, !polite && offerCollision);
      
      if (ignoreOffer.current.get(senderId)) {
        console.log('Ignoring offer due to collision (we are impolite)');
        return;
      }

      try {
        // If we're in the middle of something, rollback
        if (pc.signalingState !== 'stable') {
          await Promise.all([
            pc.setLocalDescription({ type: 'rollback' }),
            pc.setRemoteDescription(new RTCSessionDescription(sdp))
          ]);
        } else {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        }
        
        // Process any pending ICE candidates
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
        // Only set remote description if we're expecting an answer
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          
          // Process any pending ICE candidates
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
          // Queue the candidate until we have the remote description
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
        // Add the screen share track
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
    setRemoteStreamMap(new Map());
  }, []);

  // Connect to all existing participants
  const connectToParticipants = useCallback((participantIds) => {
    participantIds.forEach(id => {
      if (id !== currentUserId && !peerConnections.current.has(id)) {
        callUser(id);
      }
    });
  }, [currentUserId, callUser]);

  return {
    remoteStreamMap,
    setLocalStream,
    handleSignal,
    callUser,
    closeConnection,
    closeAllConnections,
    connectToParticipants,
    addScreenShareTrack,
    removeScreenShareTrack
  };
};

export default useWebRTC;
