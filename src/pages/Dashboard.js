import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, MapPin, School, MessageCircle, User as UserIcon, Home, Video } from 'lucide-react';
import { toast } from 'sonner';
import api, { clearAuth } from '../utils/api';
import ThemeToggle from '../components/ThemeToggle';

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [universities, setUniversities] = useState({});
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedCampus, setSelectedCampus] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchUser();
    fetchUniversities();
    
    // Send heartbeat to track online users
    const visitorId = localStorage.getItem('visitor_id') || `user_${Date.now()}`;
    const sendHeartbeat = async () => {
      try {
        await api.post('/stats/heartbeat', { visitorId });
      } catch (err) {}
    };
    sendHeartbeat();
    const heartbeatInterval = setInterval(sendHeartbeat, 30000);
    return () => clearInterval(heartbeatInterval);
  }, []);

  const fetchUser = async () => {
    try {
      const response = await api.get('/auth/me');
      setUser(response.data.user);
      if (response.data.user.region) setSelectedRegion(response.data.user.region);
      if (response.data.user.campus) setSelectedCampus(response.data.user.campus);
    } catch (error) {
      toast.error('Failed to load profile');
    }
  };

  const fetchUniversities = async () => {
    try {
      const response = await api.get('/universities');
      setUniversities(response.data.universities);
    } catch (error) {
      console.error('Failed to load universities');
    }
  };

  const handleSave = async () => {
    if (!selectedRegion || !selectedCampus) {
      toast.error('Please select both region and campus');
      return;
    }

    setLoading(true);
    try {
      await api.put('/profile', {
        region: selectedRegion,
        campus: selectedCampus,
      });
      toast.success('Settings saved!');
      setUser({ ...user, region: selectedRegion, campus: selectedCampus });
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  const handleFindStranger = async () => {
    if (!selectedRegion || !selectedCampus) {
      toast.error('Please select region and campus first');
      return;
    }

    navigate('/matching');
  };

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
      clearAuth();
      toast.success('Logged out successfully');
      navigate('/', { replace: true });
    } catch (error) {
      clearAuth();
      navigate('/', { replace: true });
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-emerald-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl float-animation" />
        <div className="absolute bottom-20 right-20 w-36 h-36 bg-emerald-500/20 rounded-full blur-3xl float-animation" style={{ animationDelay: '1s' }} />
      </div>

      {/* Header */}
      <header className="relative z-10 px-4 sm:px-6 py-4 sm:py-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2 sm:gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-purple-600 to-emerald-500 rounded-xl flex items-center justify-center">
              <MessageCircle className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gradient">UniBuddy</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={() => navigate('/')}
              className="p-2 sm:p-3 rounded-full glass hover:scale-110 transition-all duration-200"
              title="Go Home"
            >
              <Home className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <ThemeToggle />
            <button
              onClick={() => navigate('/profile')}
              data-testid="profile-btn"
              className="p-2 sm:p-3 rounded-full glass hover:scale-110 transition-all duration-200"
            >
              <UserIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button
              onClick={handleLogout}
              data-testid="logout-btn"
              className="p-2 sm:p-3 rounded-full glass hover:scale-110 transition-all duration-200"
              title="Logout"
            >
              <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="relative z-10 px-4 sm:px-6 py-8 sm:py-12">
        <div className="max-w-4xl mx-auto">
          <div className="glass p-5 sm:p-8 rounded-2xl sm:rounded-3xl slide-in" data-testid="dashboard-container">
            <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
              {user.picture ? (
                <img src={user.picture} alt={user.name} className="w-12 h-12 sm:w-16 sm:h-16 rounded-full" />
              ) : (
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-purple-600 to-emerald-500 rounded-full flex items-center justify-center">
                  <span className="text-xl sm:text-2xl text-white font-bold">{user.name[0]}</span>
                </div>
              )}
              <div className="min-w-0">
                <h2 className="text-xl sm:text-2xl font-bold truncate">{user.name}</h2>
                <p className="text-sm sm:text-base text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Select Region
                </label>
                <select
                  value={selectedRegion}
                  onChange={(e) => {
                    setSelectedRegion(e.target.value);
                    setSelectedCampus('');
                  }}
                  data-testid="region-select"
                  className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                >
                  <option value="">Choose region...</option>
                  <option value="luzon">Luzon</option>
                  <option value="visayas">Visayas</option>
                  <option value="mindanao">Mindanao</option>
                </select>
              </div>

              {selectedRegion && (
                <div>
                  <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                    <School className="w-4 h-4" />
                    Select University
                  </label>
                  <select
                    value={selectedCampus}
                    onChange={(e) => setSelectedCampus(e.target.value)}
                    data-testid="campus-select"
                    className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  >
                    <option value="">Choose university...</option>
                    {universities[selectedRegion]?.map((uni) => (
                      <option key={uni} value={uni}>
                        {uni}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <button
                  onClick={handleSave}
                  data-testid="save-settings-btn"
                  disabled={loading || !selectedRegion || !selectedCampus}
                  className="flex-1 px-4 sm:px-6 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm sm:text-base"
                >
                  {loading ? 'Saving...' : 'Save Settings'}
                </button>
                <button
                  onClick={handleFindStranger}
                  data-testid="find-stranger-btn"
                  disabled={!selectedRegion || !selectedCampus}
                  className="flex-1 btn-secondary py-3 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                >
                  Find a Stranger
                </button>
              </div>

              {/* Video Rooms Button */}
              <button
                onClick={() => navigate('/rooms')}
                className="w-full flex items-center justify-center gap-2 sm:gap-3 px-4 sm:px-6 py-3 sm:py-4 bg-gradient-to-r from-purple-600 to-emerald-500 text-white rounded-xl font-medium hover:opacity-90 transition-all text-sm sm:text-base"
              >
                <Video className="w-5 h-5" />
                <span className="hidden sm:inline">Video Rooms - Create or Join a Call</span>
                <span className="sm:hidden">Video Rooms</span>
              </button>
            </div>

            <div className="mt-6 sm:mt-8 p-4 sm:p-6 bg-purple-100/50 dark:bg-purple-900/20 rounded-xl sm:rounded-2xl">
              <h3 className="text-base sm:text-lg font-semibold mb-2">How it works</h3>
              <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-muted-foreground">
                <li>1. Select your region and university</li>
                <li>2. Click "Find a Stranger" to match with someone</li>
                <li>3. Start chatting instantly when matched!</li>
                <li>4. Toggle anonymous mode in your profile anytime</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
