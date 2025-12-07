import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Video, VideoOff, Mic, MicOff, PhoneOff, Monitor, MonitorOff,
  MessageCircle, Users, Copy, QrCode, Lock, X, Send, Settings, Volume2
} from 'lucide-react';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import api from '../utils/api';
import useWebRTC from '../hooks/useWebRTC';

const VideoRoom = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [joined, setJoined] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  
  // Media states - will be loaded from MongoDB
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(true);
  const [showQR, setShowQR] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Real-time participants with media states
  const [participants, setParticipants] = useState([]);
  const [speakingUsers, setSpeakingUsers] = useState(new Set());
  // Media permission confirmation
  const [showMediaConfirm, setShowMediaConfirm] = useState(false);
  const [mediaPermissions, setMediaPermissions] = useState({ camera: false, mic: false });
  
  // Voice settings
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [autoGainControl, setAutoGainControl] = useState(true);
  const [voiceThreshold, setVoiceThreshold] = useState(0.01); // Lower threshold for better detection
  
  // Chat
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [unreadMessages, setUnreadMessages] = useState(0);
  
  // Refs
  const localVideoRef = useRef(null);
  const screenVideoRef = useRef(null); // Separate ref for screen share display
  const remoteVideoRefs = useRef(new Map()); // odId -> video element ref
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const currentUserRef = useRef(null); // Ref for voice detection
  const voiceDetectionRef = useRef(null);
  const messagesEndRef = useRef(null);
  const showChatRef = useRef(false); // Ref for chat visibility in WebSocket handler
  
  // WebRTC hook - use ref to ensure we always have the latest user ID
  const { 
    remoteStreamMap, 
    setLocalStream, 
    handleSignal, 
    callUser, 
    closeConnection, 
    closeAllConnections,
    connectToParticipants,
    addScreenShareTrack,
    removeScreenShareTrack
  } = useWebRTC(wsRef, currentUserRef.current?._id || currentUser?._id);

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Reset unread when chat is opened and update ref
  useEffect(() => {
    showChatRef.current = showChat;
    if (showChat) setUnreadMessages(0);
  }, [showChat]);

  useEffect(() => {
    const init = async () => {
      await getCurrentUser();
      await checkRoom();
    };
    init();
    return () => {
      stopAllMedia();
      disconnectWebSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const getCurrentUser = async () => {
    try {
      const res = await api.get('/auth/me');
      setCurrentUser(res.data.user);
      currentUserRef.current = res.data.user;
      return res.data.user;
    } catch (err) {
      console.error('Failed to get current user:', err);
      navigate('/login');
      return null;
    }
  };

  const checkRoom = async () => {
    try {
      const res = await api.get(`/video-rooms/${code}`);
      setRoom(res.data.room);
      setParticipants(res.data.room.participants || []);
      
      // If user is the host (creator) or already a participant, go directly into the room
      if (res.data.room.isHost || res.data.room.isParticipant) {
        setJoined(true);
        // Load saved media state from MongoDB
        try {
          const stateRes = await api.get(`/video-rooms/${code}/media-state`);
          const savedState = stateRes.data.state || {};
          startMedia(savedState.video || false, savedState.audio || false);
        } catch {
          startMedia(false, false);
        }
        connectWebSocket();
      } else {
        // For new users joining, show media confirmation
        setShowMediaConfirm(true);
      }
    } catch (err) {
      if (err.response?.status === 404) {
        toast.error('Room not found');
        navigate('/rooms');
      }
    } finally {
      setLoading(false);
    }
  };

  // Confirm join with media settings
  const confirmJoinRoom = async () => {
    setShowMediaConfirm(false);
    
    // If not already a participant, join first
    if (!room?.isParticipant) {
      try {
        const res = await api.post('/video-rooms/join', { code, password });
        setRoom(res.data.room);
        setParticipants(res.data.room.participants || []);
      } catch (err) {
        if (err.response?.data?.requiresPassword) {
          setNeedsPassword(true);
          return;
        }
        toast.error(err.response?.data?.detail || 'Failed to join');
        return;
      }
    }
    
    setJoined(true);
    setVideoEnabled(mediaPermissions.camera);
    setAudioEnabled(mediaPermissions.mic);
    startMedia(mediaPermissions.camera, mediaPermissions.mic);
    connectWebSocket();
  };

  // WebSocket connection for real-time updates
  const connectWebSocket = useCallback(() => {
    const token = localStorage.getItem('session_token') || 
      document.cookie.split('; ').find(row => row.startsWith('session_token='))?.split('=')[1];
    
    if (!token) {
      console.error('No auth token found');
      toast.error('Authentication required');
      return;
    }

    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
    }

    const wsUrl = (process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000')
      .replace('https://', 'wss://').replace('http://', 'ws://');
    
    console.log('Connecting to WebSocket:', `${wsUrl}/api/ws/${code}?type=video`);
    const ws = new WebSocket(`${wsUrl}/api/ws/${code}?token=${token}&type=video`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('Video room WebSocket connected');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'participants_update':
          setParticipants(data.participants);
          if (data.event === 'user_joined' && data.odId !== currentUserRef.current?._id) {
            // Initiate WebRTC call to the new participant
            if (localStreamRef.current) {
              setTimeout(() => callUser(data.odId), 500);
            }
          } else if (data.event === 'user_left') {
            // Close WebRTC connection with the user who left
            closeConnection(data.odId);
          }
          break;
          
        case 'chat_message':
          setMessages(prev => [...prev, {
            sender: data.sender.name,
            senderId: data.sender._id,
            content: data.content,
            time: new Date(data.timestamp)
          }]);
          if (!showChatRef.current) {
            setUnreadMessages(prev => prev + 1);
          }
          break;
          
        case 'media_state_update':
          setParticipants(prev => prev.map(p => 
            p._id === data.odId ? { ...p, mediaState: data.state } : p
          ));
          break;
          
        case 'speaking':
          setSpeakingUsers(prev => {
            const newSet = new Set(prev);
            const odIdStr = String(data.odId);
            if (data.speaking) {
              newSet.add(odIdStr);
            } else {
              newSet.delete(odIdStr);
            }
            return newSet;
          });
          break;
          
        case 'screen_share_started':
          // Update participant's screen sharing state
          setParticipants(prev => prev.map(p => 
            p._id === data.odId ? { ...p, mediaState: { ...p.mediaState, screenSharing: true }, screenSharerName: data.userName } : p
          ));
          break;
          
        case 'screen_share_stopped':
          setParticipants(prev => prev.map(p => 
            p._id === data.odId ? { ...p, mediaState: { ...p.mediaState, screenSharing: false } } : p
          ));
          break;
          
        case 'room_ended':
          toast.error(`Room ended by ${data.by}`);
          stopAllMedia();
          navigate('/rooms');
          break;
        
        case 'webrtc_signal':
          handleSignal(data);
          break;
          
        default:
          break;
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.reason);
    };
  }, [code, navigate, handleSignal, callUser, closeConnection]);

  const disconnectWebSocket = () => {
    // Stop voice detection
    if (voiceDetectionRef.current) {
      cancelAnimationFrame(voiceDetectionRef.current);
      voiceDetectionRef.current = null;
    }
    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close(1000, 'User left');
      wsRef.current = null;
    }
  };

  const sendWsMessage = (message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  const handleJoin = async (e) => {
    e?.preventDefault();
    // If password is required and provided, try to join first to validate
    if (needsPassword && password) {
      try {
        await api.post('/video-rooms/join', { code, password });
        setNeedsPassword(false);
        // Update room info
        const res = await api.get(`/video-rooms/${code}`);
        setRoom(res.data.room);
        setParticipants(res.data.room.participants || []);
      } catch (err) {
        if (err.response?.data?.requiresPassword) {
          toast.error('Invalid password');
          return;
        }
        toast.error(err.response?.data?.detail || 'Failed to join');
        return;
      }
    }
    // Show media permission confirmation
    setShowMediaConfirm(true);
  };

  const startMedia = async (enableCamera = false, enableMic = false) => {
    try {
      // Always request both video and audio, but disable tracks based on user choice
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: {
          noiseSuppression,
          echoCancellation,
          autoGainControl
        }
      });
      localStreamRef.current = stream;
      setLocalStream(stream); // Set stream for WebRTC
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      // Disable tracks based on user choice (default is OFF)
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      
      if (videoTrack) {
        videoTrack.enabled = enableCamera;
        setVideoEnabled(enableCamera);
      }
      if (audioTrack) {
        audioTrack.enabled = enableMic;
        setAudioEnabled(enableMic);
      }
      
      // Setup voice activity detection (always setup, but only sends when unmuted)
      setupVoiceDetection(stream);
      
      // Send initial media state and connect to existing participants
      setTimeout(() => {
        sendWsMessage({ type: 'media_state', state: { video: enableCamera, audio: enableMic } });
        // Connect to all existing participants via WebRTC
        const otherParticipantIds = participants
          .filter(p => p._id !== currentUser?._id)
          .map(p => p._id);
        if (otherParticipantIds.length > 0) {
          connectToParticipants(otherParticipantIds);
        }
      }, 1000);
    } catch (err) {
      console.error('Media error:', err);
      toast.error('Could not access camera/microphone');
    }
  };

  // Voice Activity Detection
  const setupVoiceDetection = (stream) => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      analyserRef.current = analyser;
      
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let isSpeaking = false;
      let silenceTimeout = null;
      
      const detectVoice = () => {
        analyser.getByteFrequencyData(dataArray);
        
        // Calculate average volume
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length / 255;
        
        // Check if audio track is enabled (not muted)
        const audioTrack = localStreamRef.current?.getAudioTracks()[0];
        const isAudioEnabled = audioTrack?.enabled ?? false;
        
        const odId = currentUserRef.current?._id;
        const odIdStr = odId ? String(odId) : null;
        
        if (average > voiceThreshold && isAudioEnabled && odIdStr) {
          if (!isSpeaking) {
            isSpeaking = true;
            setSpeakingUsers(prev => new Set([...prev, odIdStr]));
            sendWsMessage({ type: 'speaking', speaking: true });
          }
          if (silenceTimeout) {
            clearTimeout(silenceTimeout);
            silenceTimeout = null;
          }
        } else if (isSpeaking) {
          if (!silenceTimeout) {
            silenceTimeout = setTimeout(() => {
              isSpeaking = false;
              setSpeakingUsers(prev => {
                const newSet = new Set(prev);
                newSet.delete(odIdStr);
                return newSet;
              });
              sendWsMessage({ type: 'speaking', speaking: false });
            }, 300);
          }
        }
        
        voiceDetectionRef.current = requestAnimationFrame(detectVoice);
      };
      
      detectVoice();
    } catch (err) {
      console.error('Voice detection setup error:', err);
    }
  };

  // Apply audio settings
  const applyAudioSettings = async () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        try {
          await audioTrack.applyConstraints({
            noiseSuppression,
            echoCancellation,
            autoGainControl
          });
          toast.success('Audio settings applied');
        } catch (err) {
          console.error('Failed to apply audio settings:', err);
        }
      }
    }
  };

  const stopAllMedia = () => {
    // Stop all local media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('Stopped track:', track.kind);
      });
      localStreamRef.current = null;
    }
    // Stop screen share tracks
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('Stopped screen track:', track.kind);
      });
      screenStreamRef.current = null;
    }
    // Clear video elements
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = null;
    }
    // Close all WebRTC connections
    closeAllConnections();
  };

  // Save media state to MongoDB
  const saveMediaState = async (video, audio, screenShare) => {
    try {
      await api.post(`/video-rooms/${code}/media-state`, { 
        video, 
        audio, 
        screenSharing: screenShare 
      });
    } catch (err) {
      console.error('Failed to save media state:', err);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setVideoEnabled(videoTrack.enabled);
        // Save to MongoDB for persistence
        saveMediaState(videoTrack.enabled, audioEnabled, screenSharing);
        sendWsMessage({ type: 'media_state', state: { video: videoTrack.enabled } });
      }
    }
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setAudioEnabled(audioTrack.enabled);
        // Save to MongoDB for persistence
        saveMediaState(videoEnabled, audioTrack.enabled, screenSharing);
        sendWsMessage({ type: 'media_state', state: { audio: audioTrack.enabled } });
        
        // Clear speaking state when muted
        if (!audioTrack.enabled) {
          setSpeakingUsers(prev => {
            const newSet = new Set(prev);
            newSet.delete(String(currentUser?._id));
            return newSet;
          });
        }
      }
    }
  };

  const toggleScreenShare = async () => {
    if (screenSharing) {
      // Stop screen sharing
      if (screenStreamRef.current) {
        removeScreenShareTrack(screenStreamRef.current);
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
      }
      setScreenSharing(false);
      saveMediaState(videoEnabled, audioEnabled, false);
      sendWsMessage({ type: 'screen_share_stopped' });
      sendWsMessage({ type: 'media_state', state: { screenSharing: false } });
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screenStream;
        
        // Set screen share to the screen video ref (local preview)
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = screenStream;
        }
        
        // Add screen share track to WebRTC peer connections
        addScreenShareTrack(screenStream);
        
        // Handle when user stops sharing via browser UI
        screenStream.getVideoTracks()[0].onended = () => {
          if (screenStreamRef.current) {
            removeScreenShareTrack(screenStreamRef.current);
            screenStreamRef.current = null;
          }
          setScreenSharing(false);
          saveMediaState(videoEnabled, audioEnabled, false);
          sendWsMessage({ type: 'screen_share_stopped' });
          sendWsMessage({ type: 'media_state', state: { screenSharing: false } });
        };
        
        setScreenSharing(true);
        saveMediaState(videoEnabled, audioEnabled, true);
        sendWsMessage({ type: 'screen_share_started' });
        sendWsMessage({ type: 'media_state', state: { screenSharing: true } });
      } catch (err) {
        console.error('Screen share error:', err);
      }
    }
  };

  const handleLeave = async () => {
    try {
      // Stop all media first
      stopAllMedia();
      disconnectWebSocket();
      
      if (room?.isHost) {
        sendWsMessage({ type: 'room_ended' });
      }
      await api.post(`/video-rooms/${code}/leave`);
      navigate('/rooms');
    } catch (err) {
      // Still navigate even if API call fails
      navigate('/rooms');
    }
  };

  const copyInviteLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/room/${code}`);
    toast.success('Invite link copied!');
  };

  const sendMessage = () => {
    if (!chatInput.trim()) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      toast.error('Not connected to room');
      return;
    }
    sendWsMessage({ type: 'chat_message', content: chatInput });
    setChatInput('');
  };

  // Calculate grid layout based on participant count
  const getGridClass = (count) => {
    if (count <= 1) return 'grid-cols-1';
    if (count <= 2) return 'grid-cols-1 md:grid-cols-2';
    if (count <= 4) return 'grid-cols-2';
    if (count <= 6) return 'grid-cols-2 md:grid-cols-3';
    return 'grid-cols-3 md:grid-cols-4';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-zinc-400">Loading room...</p>
        </div>
      </div>
    );
  }

  // Password/Join screen
  if (!joined && !showMediaConfirm) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-950 to-black flex items-center justify-center p-4">
        <div className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 p-8 rounded-3xl w-full max-w-md text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Video className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">{room?.name || 'Video Room'}</h1>
          <p className="text-zinc-400 mb-2">Room Code: <span className="font-mono text-purple-400">{code}</span></p>
          <p className="text-zinc-500 text-sm mb-6">{room?.participants?.length || 0} participant(s) in room</p>
          
          {(room?.hasPassword || needsPassword) && (
            <form onSubmit={handleJoin} className="mb-6">
              <div className="flex items-center gap-2 mb-4 justify-center text-zinc-400">
                <Lock className="w-4 h-4" />
                <span className="text-sm">This room requires a password</span>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent mb-4"
                placeholder="Enter password"
              />
            </form>
          )}
          
          <div className="flex gap-3">
            <button onClick={() => navigate('/rooms')} className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors">
              Cancel
            </button>
            <button onClick={handleJoin} className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-emerald-500 hover:opacity-90 text-white rounded-xl font-medium transition-opacity">
              Join Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Media Permission Confirmation Screen
  if (!joined && showMediaConfirm) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-950 to-black flex items-center justify-center p-4">
        <div className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 p-6 sm:p-8 rounded-3xl w-full max-w-md">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Video className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Ready to Join?</h2>
            <p className="text-zinc-400 text-sm">Choose your camera and microphone settings</p>
          </div>
          
          <div className="space-y-3 mb-6">
            {/* Camera Toggle */}
            <div 
              onClick={() => setMediaPermissions(prev => ({ ...prev, camera: !prev.camera }))}
              className={`flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all ${mediaPermissions.camera ? 'bg-emerald-500/20 border border-emerald-500/50' : 'bg-zinc-800/50 border border-zinc-700'}`}
            >
              <div className="flex items-center gap-3">
                {mediaPermissions.camera ? (
                  <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
                    <Video className="w-5 h-5 text-white" />
                  </div>
                ) : (
                  <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center">
                    <VideoOff className="w-5 h-5 text-white" />
                  </div>
                )}
                <div>
                  <p className="text-white font-medium">Camera</p>
                  <p className="text-xs text-zinc-400">{mediaPermissions.camera ? 'Camera will be on' : 'Camera will be off'}</p>
                </div>
              </div>
              <div className={`w-12 h-6 rounded-full transition-colors ${mediaPermissions.camera ? 'bg-emerald-500' : 'bg-zinc-600'}`}>
                <div className={`w-5 h-5 bg-white rounded-full transition-transform mt-0.5 ${mediaPermissions.camera ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </div>
            </div>

            {/* Microphone Toggle */}
            <div 
              onClick={() => setMediaPermissions(prev => ({ ...prev, mic: !prev.mic }))}
              className={`flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all ${mediaPermissions.mic ? 'bg-emerald-500/20 border border-emerald-500/50' : 'bg-zinc-800/50 border border-zinc-700'}`}
            >
              <div className="flex items-center gap-3">
                {mediaPermissions.mic ? (
                  <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
                    <Mic className="w-5 h-5 text-white" />
                  </div>
                ) : (
                  <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center">
                    <MicOff className="w-5 h-5 text-white" />
                  </div>
                )}
                <div>
                  <p className="text-white font-medium">Microphone</p>
                  <p className="text-xs text-zinc-400">{mediaPermissions.mic ? 'Microphone will be on' : 'You will be muted'}</p>
                </div>
              </div>
              <div className={`w-12 h-6 rounded-full transition-colors ${mediaPermissions.mic ? 'bg-emerald-500' : 'bg-zinc-600'}`}>
                <div className={`w-5 h-5 bg-white rounded-full transition-transform mt-0.5 ${mediaPermissions.mic ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </div>
            </div>
          </div>

          <p className="text-zinc-500 text-xs text-center mb-4">
            You can change these settings anytime during the call
          </p>

          <div className="flex gap-3">
            <button 
              onClick={() => { setShowMediaConfirm(false); navigate('/rooms'); }} 
              className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={confirmJoinRoom} 
              className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-emerald-500 hover:opacity-90 text-white rounded-xl font-medium transition-opacity flex items-center justify-center gap-2"
            >
              <Video className="w-4 h-4" />
              Join Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  const otherParticipants = participants.filter(p => p._id !== currentUser?._id);

  return (
    <div className="h-screen bg-zinc-950 flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-2 sm:px-4 py-2 sm:py-3 bg-zinc-900/90 backdrop-blur border-b border-zinc-800">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-emerald-500 rounded-lg flex items-center justify-center">
            <Video className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-white text-sm">{room?.name}</h1>
            <span className="text-xs text-zinc-500">{code}</span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <button onClick={copyInviteLink} className="p-1.5 sm:p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors" title="Copy invite link">
            <Copy className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button onClick={() => setShowQR(true)} className="hidden sm:block p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors" title="Show QR code">
            <QrCode className="w-5 h-5" />
          </button>
          <button onClick={() => setShowSettings(true)} className="p-1.5 sm:p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors" title="Settings">
            <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button onClick={() => { setShowParticipants(!showParticipants); setShowChat(false); }} className={`p-1.5 sm:p-2 rounded-lg transition-colors relative ${showParticipants ? 'bg-purple-600 text-white' : 'hover:bg-zinc-800 text-zinc-400 hover:text-white'}`} title="Participants">
            <Users className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-emerald-500 rounded-full text-[10px] sm:text-xs flex items-center justify-center text-white font-medium">
              {participants.length}
            </span>
          </button>
          <button onClick={() => { setShowChat(!showChat); setShowParticipants(false); }} className={`p-1.5 sm:p-2 rounded-lg transition-colors relative ${showChat ? 'bg-purple-600 text-white' : 'hover:bg-zinc-800 text-zinc-400 hover:text-white'}`} title="Chat">
            <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5" />
            {unreadMessages > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-red-500 rounded-full text-[10px] sm:text-xs flex items-center justify-center text-white font-medium">
                {unreadMessages > 9 ? '9+' : unreadMessages}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Video Grid */}
        <div className="flex-1 p-2 sm:p-4 overflow-auto">
          <div className="flex flex-col gap-2 sm:gap-3 h-full">
            {/* Screen Share Section - Full width at top */}
            {(screenSharing || otherParticipants.some(p => p.mediaState?.screenSharing)) && (
              <div className="relative bg-black rounded-xl sm:rounded-2xl overflow-hidden border-2 border-emerald-500" style={{ minHeight: '40vh' }}>
                {screenSharing ? (
                  <>
                    <video
                      ref={screenVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute top-3 left-3 bg-emerald-500 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5">
                      <Monitor className="w-3.5 h-3.5" />
                      You are sharing your screen
                    </div>
                    <div className="absolute bottom-3 right-3">
                      <button 
                        onClick={toggleScreenShare}
                        className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
                      >
                        <MonitorOff className="w-4 h-4" />
                        Stop Sharing
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                      <div className="text-center">
                        <Monitor className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                        <p className="text-white font-medium text-lg">
                          {otherParticipants.find(p => p.mediaState?.screenSharing)?.name} is sharing their screen
                        </p>
                        <p className="text-zinc-400 text-sm mt-2">WebRTC connection required for live view</p>
                      </div>
                    </div>
                    <div className="absolute top-3 left-3 bg-emerald-500 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5">
                      <Monitor className="w-3.5 h-3.5" />
                      Screen Share
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Participants Grid */}
            <div className={`grid ${getGridClass(participants.length)} gap-2 sm:gap-3 flex-1`}>
              {/* Your Video */}
              <div className={`relative bg-zinc-900 rounded-xl sm:rounded-2xl overflow-hidden min-h-[120px] sm:min-h-[180px] transition-all duration-300 ${speakingUsers.has(String(currentUser?._id)) ? 'ring-4 ring-emerald-500 ring-opacity-75' : 'border border-zinc-800'}`}>
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className={`w-full h-full object-cover ${!videoEnabled ? 'hidden' : ''}`}
                />
                {!videoEnabled && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                    <div className="text-center">
                      {currentUser?.picture ? (
                        <img src={currentUser.picture} alt="" className="w-16 h-16 sm:w-20 sm:h-20 rounded-full mx-auto mb-2 border-4 border-purple-500" />
                      ) : (
                        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-purple-600 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-2 text-xl sm:text-2xl font-bold text-white">
                          {currentUser?.name?.charAt(0) || 'Y'}
                        </div>
                      )}
                      <p className="text-white font-medium text-sm sm:text-base">{currentUser?.name || 'You'}</p>
                    </div>
                  </div>
                )}
                {/* Screen sharing badge on your video */}
                {screenSharing && (
                  <div className="absolute top-2 left-2 bg-emerald-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                    <Monitor className="w-3 h-3" />
                    Sharing
                  </div>
                )}
                {speakingUsers.has(String(currentUser?._id)) && (
                  <div className="absolute top-2 right-2 bg-emerald-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                    <Volume2 className="w-3 h-3" />
                  </div>
                )}
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                  <span className="bg-black/60 backdrop-blur px-2 py-1 rounded-full text-xs text-white font-medium">
                    You {room?.isHost && <span className="text-purple-400">(Host)</span>}
                  </span>
                  <div className="flex items-center gap-1">
                    {!audioEnabled && <div className="bg-red-500 p-1 rounded-full"><MicOff className="w-2.5 h-2.5 text-white" /></div>}
                    {!videoEnabled && <div className="bg-red-500 p-1 rounded-full"><VideoOff className="w-2.5 h-2.5 text-white" /></div>}
                  </div>
                </div>
              </div>

              {/* Other Participants */}
              {otherParticipants.map((participant) => (
                <div key={participant._id} className={`relative bg-zinc-900 rounded-xl sm:rounded-2xl overflow-hidden min-h-[120px] sm:min-h-[180px] transition-all duration-300 ${speakingUsers.has(String(participant._id)) ? 'ring-4 ring-emerald-500 ring-opacity-75' : 'border border-zinc-800'}`}>
                  {/* Remote Video Stream */}
                  <video
                    ref={el => {
                      if (el) {
                        remoteVideoRefs.current.set(participant._id, el);
                        const stream = remoteStreamMap.get(participant._id);
                        if (stream && el.srcObject !== stream) {
                          el.srcObject = stream;
                        }
                      }
                    }}
                    autoPlay
                    playsInline
                    className={`w-full h-full object-cover absolute inset-0 ${!participant.mediaState?.video || !remoteStreamMap.has(participant._id) ? 'hidden' : ''}`}
                  />
                  {/* Fallback avatar when no video */}
                  {(!participant.mediaState?.video || !remoteStreamMap.has(participant._id)) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                    <div className="text-center">
                      {participant.picture ? (
                        <img src={participant.picture} alt="" className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full mx-auto mb-2 border-4 ${participant.mediaState?.video === false ? 'border-red-500/50 opacity-70' : 'border-zinc-600'}`} />
                      ) : (
                        <div className={`w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-purple-600 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-2 text-xl sm:text-2xl font-bold text-white ${participant.mediaState?.video === false ? 'opacity-70' : ''}`}>
                          {participant.name?.charAt(0)}
                        </div>
                      )}
                      <p className="text-white font-medium text-sm sm:text-base">{participant.name}</p>
                      {participant.mediaState?.audio === false && (
                        <div className="flex items-center justify-center gap-1 mt-1 text-red-400 text-xs">
                          <MicOff className="w-3 h-3" />
                          <span>Muted</span>
                        </div>
                      )}
                    </div>
                  </div>
                  )}
                  {/* Top indicators */}
                  <div className="absolute top-2 left-2 right-2 flex justify-between">
                    <div className="flex gap-1">
                      {participant.mediaState?.video === false && (
                        <div className="bg-red-500/80 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                          <VideoOff className="w-3 h-3" />
                        </div>
                      )}
                      {participant.mediaState?.screenSharing && (
                        <div className="bg-emerald-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                          <Monitor className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                    {speakingUsers.has(String(participant._id)) && (
                      <div className="bg-emerald-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                        <Volume2 className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                    <span className="bg-black/60 backdrop-blur px-2 py-1 rounded-full text-xs text-white font-medium truncate max-w-[70%]">
                      {participant.name} {room?.host?._id === participant._id && <span className="text-purple-400">(Host)</span>}
                    </span>
                    <div className="flex items-center gap-1">
                      {participant.mediaState?.audio === false && <div className="bg-red-500 p-1 rounded-full"><MicOff className="w-2.5 h-2.5 text-white" /></div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>


        {/* Sidebar - Participants */}
        {showParticipants && (
          <div className="absolute sm:relative inset-0 sm:inset-auto sm:w-72 lg:w-80 bg-zinc-900/98 sm:bg-zinc-900/95 backdrop-blur border-l border-zinc-800 flex flex-col z-10">
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-zinc-800">
              <h3 className="font-semibold text-white text-sm sm:text-base">Participants ({participants.length})</h3>
              <button onClick={() => setShowParticipants(false)} className="text-zinc-400 hover:text-white transition-colors p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-2">
              {participants.map((p) => (
                <div key={p._id} className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl transition-colors ${p._id === currentUser?._id ? 'bg-purple-600/20 border border-purple-500/30' : 'hover:bg-zinc-800'}`}>
                  <div className="relative">
                    {p.picture ? (
                      <img src={p.picture} alt="" className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 ${speakingUsers.has(String(p._id)) ? 'border-emerald-500' : p.mediaState?.video === false ? 'border-red-500/50 opacity-70' : 'border-zinc-700'}`} />
                    ) : (
                      <div className={`w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-purple-600 to-emerald-500 rounded-full flex items-center justify-center text-white font-bold text-base sm:text-lg border-2 ${speakingUsers.has(String(p._id)) ? 'border-emerald-500' : 'border-transparent'} ${p.mediaState?.video === false ? 'opacity-70' : ''}`}>
                        {p.name?.charAt(0)}
                      </div>
                    )}
                    {speakingUsers.has(String(p._id)) && (
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                        <Volume2 className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate text-sm sm:text-base">
                      {p.name} {p._id === currentUser?._id && <span className="text-zinc-400">(You)</span>}
                    </p>
                    <div className="flex items-center gap-2">
                      {room?.host?._id === p._id && (
                        <span className="text-xs text-purple-400 font-medium">Host</span>
                      )}
                      {p.mediaState?.audio === false && (
                        <span className="text-xs text-red-400 flex items-center gap-0.5">
                          <MicOff className="w-3 h-3" /> Muted
                        </span>
                      )}
                      {p.mediaState?.video === false && (
                        <span className="text-xs text-red-400 flex items-center gap-0.5">
                          <VideoOff className="w-3 h-3" /> Cam Off
                        </span>
                      )}
                      {p.mediaState?.screenSharing && (
                        <span className="text-xs text-emerald-400 flex items-center gap-0.5">
                          <Monitor className="w-3 h-3" /> Sharing
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {p.mediaState?.audio === false && <div className="w-6 h-6 bg-red-500/20 rounded-full flex items-center justify-center"><MicOff className="w-3 h-3 text-red-400" /></div>}
                    {p.mediaState?.video === false && <div className="w-6 h-6 bg-red-500/20 rounded-full flex items-center justify-center"><VideoOff className="w-3 h-3 text-red-400" /></div>}
                    <div className={`w-2 h-2 rounded-full ${speakingUsers.has(String(p._id)) ? 'bg-emerald-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 sm:p-4 border-t border-zinc-800">
              <button onClick={copyInviteLink} className="w-full py-2.5 sm:py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl flex items-center justify-center gap-2 transition-colors text-sm sm:text-base">
                <Copy className="w-4 h-4" />
                Copy Invite Link
              </button>
            </div>
          </div>
        )}

        {/* Sidebar - Chat */}
        {showChat && (
          <div className="absolute sm:relative inset-0 sm:inset-auto sm:w-72 lg:w-80 bg-zinc-900/98 sm:bg-zinc-900/95 backdrop-blur border-l border-zinc-800 flex flex-col z-10">
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-zinc-800">
              <h3 className="font-semibold text-white text-sm sm:text-base">Chat</h3>
              <button onClick={() => setShowChat(false)} className="text-zinc-400 hover:text-white transition-colors p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="text-center py-8">
                  <MessageCircle className="w-12 h-12 text-zinc-700 mx-auto mb-2" />
                  <p className="text-zinc-500 text-sm">No messages yet</p>
                  <p className="text-zinc-600 text-xs">Start the conversation!</p>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className={`p-3 rounded-xl ${msg.senderId === currentUser?._id ? 'bg-purple-600/30 ml-4' : 'bg-zinc-800/50 mr-4'}`}>
                    <p className="text-xs text-purple-400 font-medium mb-1">{msg.senderId === currentUser?._id ? 'You' : msg.sender}</p>
                    <p className="text-white text-sm">{msg.content}</p>
                    <p className="text-xs text-zinc-500 mt-1">{new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-4 border-t border-zinc-800">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <button onClick={sendMessage} className="p-3 bg-purple-600 hover:bg-purple-700 rounded-xl transition-colors">
                  <Send className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2 sm:gap-3 p-3 sm:p-4 bg-zinc-900/90 backdrop-blur border-t border-zinc-800">
        <button
          onClick={toggleAudio}
          className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl transition-all ${audioEnabled ? 'bg-zinc-800 hover:bg-zinc-700 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}
          title={audioEnabled ? 'Mute' : 'Unmute'}
        >
          {audioEnabled ? <Mic className="w-5 h-5 sm:w-6 sm:h-6" /> : <MicOff className="w-5 h-5 sm:w-6 sm:h-6" />}
        </button>
        <button
          onClick={toggleVideo}
          className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl transition-all ${videoEnabled ? 'bg-zinc-800 hover:bg-zinc-700 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}
          title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
        >
          {videoEnabled ? <Video className="w-5 h-5 sm:w-6 sm:h-6" /> : <VideoOff className="w-5 h-5 sm:w-6 sm:h-6" />}
        </button>
        <button
          onClick={toggleScreenShare}
          className={`hidden sm:block p-3 sm:p-4 rounded-xl sm:rounded-2xl transition-all ${screenSharing ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-white'}`}
          title={screenSharing ? 'Stop sharing' : 'Share screen'}
        >
          {screenSharing ? <MonitorOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Monitor className="w-5 h-5 sm:w-6 sm:h-6" />}
        </button>
        <div className="w-px h-6 sm:h-8 bg-zinc-700 mx-1 sm:mx-2"></div>
        <button
          onClick={handleLeave}
          className="px-4 sm:px-6 py-3 sm:py-4 rounded-xl sm:rounded-2xl bg-red-500 hover:bg-red-600 text-white font-medium transition-all flex items-center gap-2"
          title="Leave"
        >
          <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5" />
          <span className="hidden sm:inline">Leave</span>
        </button>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowSettings(false)}>
          <div className="bg-zinc-900 border border-zinc-800 p-6 sm:p-8 rounded-3xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Voice Settings
              </h2>
              <button onClick={() => setShowSettings(false)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Noise Suppression */}
              <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-xl">
                <div>
                  <p className="text-white font-medium">Noise Suppression</p>
                  <p className="text-xs text-zinc-400">Reduce background noise</p>
                </div>
                <button
                  onClick={() => setNoiseSuppression(!noiseSuppression)}
                  className={`w-12 h-6 rounded-full transition-colors ${noiseSuppression ? 'bg-emerald-500' : 'bg-zinc-600'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${noiseSuppression ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {/* Echo Cancellation */}
              <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-xl">
                <div>
                  <p className="text-white font-medium">Echo Cancellation</p>
                  <p className="text-xs text-zinc-400">Remove audio echo</p>
                </div>
                <button
                  onClick={() => setEchoCancellation(!echoCancellation)}
                  className={`w-12 h-6 rounded-full transition-colors ${echoCancellation ? 'bg-emerald-500' : 'bg-zinc-600'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${echoCancellation ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {/* Auto Gain Control */}
              <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-xl">
                <div>
                  <p className="text-white font-medium">Auto Gain Control</p>
                  <p className="text-xs text-zinc-400">Normalize volume levels</p>
                </div>
                <button
                  onClick={() => setAutoGainControl(!autoGainControl)}
                  className={`w-12 h-6 rounded-full transition-colors ${autoGainControl ? 'bg-emerald-500' : 'bg-zinc-600'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${autoGainControl ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {/* Voice Sensitivity */}
              <div className="p-4 bg-zinc-800/50 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-white font-medium">Voice Sensitivity</p>
                    <p className="text-xs text-zinc-400">Adjust voice detection threshold</p>
                  </div>
                  <span className="text-emerald-400 text-sm font-mono">{Math.round(voiceThreshold * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.01"
                  max="0.1"
                  step="0.01"
                  value={voiceThreshold}
                  onChange={(e) => setVoiceThreshold(parseFloat(e.target.value))}
                  className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <div className="flex justify-between text-xs text-zinc-500 mt-1">
                  <span>Sensitive</span>
                  <span>Less Sensitive</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => { applyAudioSettings(); setShowSettings(false); }}
              className="w-full mt-6 py-3 bg-gradient-to-r from-purple-600 to-emerald-500 hover:opacity-90 text-white rounded-xl font-medium transition-opacity"
            >
              Apply Settings
            </button>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {showQR && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowQR(false)}>
          <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl text-center max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-4">Scan to Join</h2>
            <div className="bg-white p-4 rounded-2xl inline-block mb-4">
              <QRCodeSVG value={`${window.location.origin}/room/${code}`} size={180} />
            </div>
            <p className="text-zinc-400 mb-2">Room Code</p>
            <p className="font-mono text-2xl font-bold text-purple-400 mb-6">{code}</p>
            <div className="flex gap-3">
              <button onClick={copyInviteLink} className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl flex items-center justify-center gap-2 transition-colors">
                <Copy className="w-4 h-4" />
                Copy Link
              </button>
              <button onClick={() => setShowQR(false)} className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoRoom;
