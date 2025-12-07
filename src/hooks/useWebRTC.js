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
  const pendingCandidates = useRef(new Map()); // odId -> ICE candidates waiting for remote description

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
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        // Try to restart ICE
        pc.restartIce();
      }
    };

    // Handle incoming tracks (remote video/audio)
    pc.ontrack = (event) => {
      console.log('Received remote track from:', remoteUserId, event.track.kind);
      let stream = remoteStreams.current.get(remoteUserId);
      if (!stream) {
        stream = new MediaStream();
        remoteStreams.current.set(remoteUserId, stream);
      }
      stream.addTrack(event.track);
      setRemoteStreamMap(new Map(remoteStreams.current));
    };

    peerConnections.current.set(remoteUserId, pc);
    return pc;
  }, [sendSignal]);

  // Initiate call to a remote user (caller side)
  const callUser = useCallback(async (remoteUserId) => {
    const pc = createPeerConnection(remoteUserId);
    
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await pc.setLocalDescription(offer);
      sendSignal('offer', remoteUserId, { sdp: offer });
      console.log('Sent offer to:', remoteUserId);
    } catch (err) {
      console.error('Error creating offer:', err);
    }
  }, [createPeerConnection, sendSignal]);

  // Handle incoming WebRTC signals
  const handleSignal = useCallback(async (data) => {
    const { signalType, senderId, sdp, candidate } = data;
    console.log('Received signal:', signalType, 'from:', senderId);

    if (signalType === 'offer') {
      const pc = createPeerConnection(senderId);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        
        // Process any pending ICE candidates
        const pending = pendingCandidates.current.get(senderId) || [];
        for (const c of pending) {
          await pc.addIceCandidate(new RTCIceCandidate(c));
        }
        pendingCandidates.current.delete(senderId);
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal('answer', senderId, { sdp: answer });
        console.log('Sent answer to:', senderId);
      } catch (err) {
        console.error('Error handling offer:', err);
      }
    } else if (signalType === 'answer') {
      const pc = peerConnections.current.get(senderId);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          
          // Process any pending ICE candidates
          const pending = pendingCandidates.current.get(senderId) || [];
          for (const c of pending) {
            await pc.addIceCandidate(new RTCIceCandidate(c));
          }
          pendingCandidates.current.delete(senderId);
        } catch (err) {
          console.error('Error handling answer:', err);
        }
      }
    } else if (signalType === 'ice-candidate') {
      const pc = peerConnections.current.get(senderId);
      if (pc && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      } else {
        // Queue the candidate until we have the remote description
        if (!pendingCandidates.current.has(senderId)) {
          pendingCandidates.current.set(senderId, []);
        }
        pendingCandidates.current.get(senderId).push(candidate);
      }
    }
  }, [createPeerConnection, sendSignal]);

  // Update local stream tracks on all peer connections
  const updateLocalStream = useCallback((stream) => {
    localStreamRef.current = stream;
    
    peerConnections.current.forEach((pc, odId) => {
      const senders = pc.getSenders();
      stream.getTracks().forEach(track => {
        const sender = senders.find(s => s.track?.kind === track.kind);
        if (sender) {
          sender.replaceTrack(track);
        } else {
          pc.addTrack(track, stream);
        }
      });
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
    setRemoteStreamMap(new Map(remoteStreams.current));
  }, []);

  // Close all connections
  const closeAllConnections = useCallback(() => {
    peerConnections.current.forEach(pc => pc.close());
    peerConnections.current.clear();
    remoteStreams.current.clear();
    pendingCandidates.current.clear();
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
    updateLocalStream,
    handleSignal,
    callUser,
    closeConnection,
    closeAllConnections,
    connectToParticipants
  };
};

export default useWebRTC;
