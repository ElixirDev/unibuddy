import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, LogOut as EndChat, User as UserIcon } from 'lucide-react';
import { toast } from 'sonner';
import api from '../utils/api';

const ChatRoom = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [ws, setWs] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchCurrentUser();
    fetchMessages();
    connectWebSocket();

    return () => {
      if (ws) {
        ws.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchCurrentUser = async () => {
    try {
      const response = await api.get('/auth/me');
      setCurrentUser(response.data.user);
    } catch (error) {
      console.error('Failed to fetch user');
    }
  };

  const fetchMessages = async () => {
    try {
      const response = await api.get(`/chat/${roomId}/messages`);
      setMessages(response.data.messages);
    } catch (error) {
      toast.error('Failed to load messages');
    }
  };

  const connectWebSocket = () => {
    const token = document.cookie
      .split('; ')
      .find(row => row.startsWith('session_token='))
      ?.split('=')[1];

    if (!token) {
      toast.error('Authentication error');
      navigate('/dashboard');
      return;
    }

    const wsUrl = process.env.REACT_APP_BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');
    const socket = new WebSocket(`${wsUrl}/api/ws/${roomId}?token=${token}`);

    socket.onopen = () => {
      console.log('WebSocket connected');
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'message') {
        setMessages(prev => [...prev, data.message]);
      } else if (data.type === 'chat_ended') {
        toast.info('Chat ended by stranger');
        setTimeout(() => navigate('/dashboard'), 2000);
      } else if (data.type === 'matched') {
        // Handle if needed
      }
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      toast.error('Connection error');
    };

    socket.onclose = () => {
      console.log('WebSocket closed');
    };

    setWs(socket);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !ws) return;

    const messageData = {
      content: newMessage,
      type: 'text',
    };

    ws.send(JSON.stringify(messageData));
    
    // Add own message to local state
    const ownMessage = {
      message_id: `temp_${Date.now()}`,
      room_id: roomId,
      sender_id: currentUser?.user_id,
      content: newMessage,
      message_type: 'text',
      is_anonymous: currentUser?.is_anonymous_mode || false,
      timestamp: new Date().toISOString(),
      sender_name: currentUser?.is_anonymous_mode ? null : currentUser?.name,
      sender_picture: currentUser?.is_anonymous_mode ? null : currentUser?.picture,
    };
    
    setMessages(prev => [...prev, ownMessage]);
    setNewMessage('');
  };

  const handleEndChat = async () => {
    try {
      await api.post(`/chat/${roomId}/end`);
      toast.success('Chat ended');
      navigate('/dashboard', { replace: true });
    } catch (error) {
      toast.error('Failed to end chat');
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading chat...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-emerald-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
      <div className="max-w-5xl mx-auto h-screen flex flex-col">
        {/* Header */}
        <header className="px-3 sm:px-6 py-3 sm:py-4 glass border-b border-border" data-testid="chat-header">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/dashboard')}
              data-testid="back-to-dashboard-btn"
              className="p-1.5 sm:p-2 rounded-full hover:bg-purple-100 dark:hover:bg-purple-900/20 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-purple-600 to-emerald-500 rounded-full flex items-center justify-center">
                <UserIcon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-sm sm:text-base">Chatting with Stranger</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  {currentUser.is_anonymous_mode ? 'You are anonymous' : 'Your profile is visible'}
                </p>
              </div>
            </div>
            <button
              onClick={handleEndChat}
              data-testid="end-chat-btn"
              className="p-1.5 sm:p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
            >
              <EndChat className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-6 space-y-3 sm:space-y-4" data-testid="messages-container">
          {messages.map((msg) => {
            const isOwn = msg.sender_id === currentUser?.user_id;
            return (
              <div
                key={msg.message_id}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'} slide-in`}
                data-testid={`message-${msg.message_id}`}
              >
                <div className={`max-w-[85%] sm:max-w-md ${isOwn ? 'order-2' : 'order-1'}`}>
                  {!msg.is_anonymous && msg.sender_name && !isOwn && (
                    <p className="text-[10px] sm:text-xs text-muted-foreground mb-1 px-2">{msg.sender_name}</p>
                  )}
                  {msg.is_anonymous && !isOwn && (
                    <p className="text-[10px] sm:text-xs text-muted-foreground mb-1 px-2">Anonymous</p>
                  )}
                  <div
                    className={`px-3 sm:px-4 py-2 sm:py-3 rounded-2xl text-sm sm:text-base ${
                      isOwn
                        ? 'bg-purple-600 text-white rounded-tr-sm'
                        : 'bg-muted text-foreground rounded-tl-sm'
                    }`}
                  >
                    <p className="break-words">{msg.content}</p>
                  </div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 px-2">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-3 sm:px-6 py-3 sm:py-4 glass border-t border-border">
          <form onSubmit={handleSendMessage} className="flex gap-2 sm:gap-3" data-testid="message-form">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              data-testid="message-input"
              placeholder="Type a message..."
              className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-background border border-border rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-sm sm:text-base"
            />
            <button
              type="submit"
              data-testid="send-message-btn"
              disabled={!newMessage.trim()}
              className="px-3 sm:px-6 py-2.5 sm:py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1 sm:gap-2"
            >
              <Send className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ChatRoom;
