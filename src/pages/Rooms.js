import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Plus, Users, Lock, Copy, QrCode, Home, ArrowRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import api from '../utils/api';
import ThemeToggle from '../components/ThemeToggle';

const Rooms = () => {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showQR, setShowQR] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    password: '',
    maxParticipants: 10
  });
  const [joinCode, setJoinCode] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);

  const fetchRooms = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const res = await api.get('/video-rooms');
      setRooms(res.data.rooms);
    } catch (err) {
      console.error('Failed to fetch rooms');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
    // Auto-refresh every 10 seconds
    const interval = setInterval(() => fetchRooms(), 10000);
    return () => clearInterval(interval);
  }, [fetchRooms]);



  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createForm.name.trim()) {
      toast.error('Room name is required');
      return;
    }
    try {
      const res = await api.post('/video-rooms', createForm);
      toast.success('Room created!');
      setShowCreate(false);
      setCreateForm({ name: '', password: '', maxParticipants: 10 });
      navigate(`/room/${res.data.code}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create room');
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) {
      toast.error('Room code is required');
      return;
    }
    try {
      const res = await api.post('/video-rooms/join', { 
        code: joinCode.toUpperCase(), 
        password: joinPassword 
      });
      toast.success('Joined room!');
      setShowJoin(false);
      setJoinCode('');
      setJoinPassword('');
      setNeedsPassword(false);
      navigate(`/room/${res.data.room.code}`);
    } catch (err) {
      if (err.response?.data?.requiresPassword) {
        setNeedsPassword(true);
        toast.error('This room requires a password');
      } else {
        toast.error(err.response?.data?.detail || 'Failed to join room');
      }
    }
  };

  const copyInviteLink = (code) => {
    const link = `${window.location.origin}/room/${code}`;
    navigator.clipboard.writeText(link);
    toast.success('Invite link copied!');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-emerald-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
      {/* Header */}
      <header className="px-4 sm:px-6 py-4 sm:py-6 border-b border-border/50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2 sm:gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-purple-600 to-emerald-500 rounded-xl flex items-center justify-center">
              <Video className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gradient">Video Rooms</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <button 
              onClick={() => fetchRooms(true)} 
              disabled={refreshing}
              className="p-2 sm:p-3 glass rounded-full hover:scale-110 transition-all disabled:opacity-50"
              title="Refresh rooms"
            >
              <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => navigate('/')} className="p-2 sm:p-3 glass rounded-full hover:scale-110 transition-all">
              <Home className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>


      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-6 sm:mb-8">
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary flex items-center justify-center gap-2 py-3 sm:py-2"
          >
            <Plus className="w-5 h-5" />
            Create Room
          </button>
          <button
            onClick={() => setShowJoin(true)}
            className="btn-secondary flex items-center justify-center gap-2 py-3 sm:py-2"
          >
            <ArrowRight className="w-5 h-5" />
            Join Room
          </button>
        </div>

        {/* Rooms List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-8 sm:py-12 glass rounded-2xl sm:rounded-3xl px-4">
            <Video className="w-12 h-12 sm:w-16 sm:h-16 text-muted-foreground mx-auto mb-3 sm:mb-4" />
            <h3 className="text-lg sm:text-xl font-semibold mb-2">No rooms yet</h3>
            <p className="text-sm sm:text-base text-muted-foreground">Create a room or join one with a code</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {rooms.map((room) => (
              <div key={room._id} className="glass p-4 sm:p-6 rounded-xl sm:rounded-2xl card-hover">
                <div className="flex items-start justify-between mb-3 sm:mb-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-base sm:text-lg flex items-center gap-2 truncate">
                      {room.name}
                      {room.hasPassword && <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">Code: {room.code}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground flex-shrink-0 ml-2">
                    <Users className="w-4 h-4" />
                    {room.participants?.length || 0}/{room.maxParticipants}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4">
                  <span className="truncate">Host: {room.host?.name}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`/room/${room.code}`)}
                    className="flex-1 btn-primary py-2 text-sm"
                  >
                    Enter
                  </button>
                  <button
                    onClick={() => copyInviteLink(room.code)}
                    className="p-2 glass rounded-lg hover:bg-purple-500/10"
                    title="Copy invite link"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowQR(room.code)}
                    className="p-2 glass rounded-lg hover:bg-purple-500/10"
                    title="Show QR code"
                  >
                    <QrCode className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Room Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="glass p-5 sm:p-8 rounded-2xl sm:rounded-3xl w-full max-w-md slide-in max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Create Room</h2>
            <form onSubmit={handleCreate} className="space-y-3 sm:space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 sm:mb-2">Room Name</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-background border border-border rounded-xl focus:ring-2 focus:ring-purple-500 text-sm sm:text-base"
                  placeholder="My Awesome Room"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 sm:mb-2">Password (optional)</label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-background border border-border rounded-xl focus:ring-2 focus:ring-purple-500 text-sm sm:text-base"
                  placeholder="Leave empty for no password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 sm:mb-2">Max Participants</label>
                <select
                  value={createForm.maxParticipants}
                  onChange={(e) => setCreateForm({ ...createForm, maxParticipants: parseInt(e.target.value) })}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-background border border-border rounded-xl focus:ring-2 focus:ring-purple-500 text-sm sm:text-base"
                >
                  {[2, 5, 10, 15, 20, 50].map(n => (
                    <option key={n} value={n}>{n} people</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-3 sm:pt-4">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-2.5 sm:py-3 border border-border rounded-xl text-sm sm:text-base">
                  Cancel
                </button>
                <button type="submit" className="flex-1 btn-primary py-2.5 sm:py-3 text-sm sm:text-base">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join Room Modal */}
      {showJoin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="glass p-5 sm:p-8 rounded-2xl sm:rounded-3xl w-full max-w-md slide-in">
            <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Join Room</h2>
            <form onSubmit={handleJoin} className="space-y-3 sm:space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 sm:mb-2">Room Code</label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-background border border-border rounded-xl focus:ring-2 focus:ring-purple-500 uppercase tracking-widest text-center text-lg sm:text-xl"
                  placeholder="ABCD1234"
                  maxLength={8}
                />
              </div>
              {needsPassword && (
                <div>
                  <label className="block text-sm font-medium mb-1.5 sm:mb-2">Password</label>
                  <input
                    type="password"
                    value={joinPassword}
                    onChange={(e) => setJoinPassword(e.target.value)}
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-background border border-border rounded-xl focus:ring-2 focus:ring-purple-500 text-sm sm:text-base"
                    placeholder="Enter room password"
                  />
                </div>
              )}
              <div className="flex gap-3 pt-3 sm:pt-4">
                <button type="button" onClick={() => { setShowJoin(false); setNeedsPassword(false); setJoinPassword(''); }} className="flex-1 py-2.5 sm:py-3 border border-border rounded-xl text-sm sm:text-base">
                  Cancel
                </button>
                <button type="submit" className="flex-1 btn-primary py-2.5 sm:py-3 text-sm sm:text-base">
                  Join
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQR && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4" onClick={() => setShowQR(null)}>
          <div className="glass p-5 sm:p-8 rounded-2xl sm:rounded-3xl text-center slide-in" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">Scan to Join</h2>
            <div className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl inline-block mb-3 sm:mb-4">
              <QRCodeSVG value={`${window.location.origin}/room/${showQR}`} size={160} className="sm:w-[200px] sm:h-[200px]" />
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mb-2">Room Code: <span className="font-mono font-bold">{showQR}</span></p>
            <button onClick={() => setShowQR(null)} className="btn-primary px-6 sm:px-8 py-2 text-sm sm:text-base">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Rooms;
