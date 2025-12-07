import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import api from '../utils/api';
import ThemeToggle from '../components/ThemeToggle';

const Profile = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const response = await api.get('/profile');
      setUser(response.data.user);
    } catch (error) {
      toast.error('Failed to load profile');
    }
  };

  const toggleAnonymousMode = async () => {
    setLoading(true);
    try {
      const response = await api.put('/profile', {
        is_anonymous_mode: !user.is_anonymous_mode,
      });
      setUser(response.data.user);
      toast.success(
        response.data.user.is_anonymous_mode
          ? 'Anonymous mode enabled'
          : 'Profile mode enabled'
      );
    } catch (error) {
      toast.error('Failed to update mode');
    } finally {
      setLoading(false);
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
        <div className="absolute top-20 right-20 w-40 h-40 bg-emerald-500/20 rounded-full blur-3xl float-animation" />
        <div className="absolute bottom-20 left-20 w-36 h-36 bg-purple-500/20 rounded-full blur-3xl float-animation" style={{ animationDelay: '1s' }} />
      </div>

      {/* Header */}
      <header className="relative z-10 px-4 sm:px-6 py-4 sm:py-6">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <button
            onClick={() => navigate('/dashboard')}
            data-testid="back-btn"
            className="p-2 sm:p-3 rounded-full glass hover:scale-110 transition-all duration-200"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <h1 className="text-lg sm:text-2xl font-bold">Profile Settings</h1>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <div className="relative z-10 px-4 sm:px-6 py-6 sm:py-12">
        <div className="max-w-4xl mx-auto">
          <div className="glass p-5 sm:p-8 rounded-2xl sm:rounded-3xl slide-in" data-testid="profile-container">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 mb-6 sm:mb-8 pb-6 sm:pb-8 border-b border-border text-center sm:text-left">
              {user.picture ? (
                <img src={user.picture} alt={user.name} className="w-20 h-20 sm:w-24 sm:h-24 rounded-full" />
              ) : (
                <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-purple-600 to-emerald-500 rounded-full flex items-center justify-center">
                  <span className="text-3xl sm:text-4xl text-white font-bold">{user.name[0]}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2 truncate">{user.name}</h2>
                <p className="text-sm sm:text-base text-muted-foreground truncate">{user.email}</p>
                {user.campus && (
                  <p className="text-xs sm:text-sm text-purple-600 dark:text-purple-400 mt-1 truncate">
                    {user.campus} • {user.region?.charAt(0).toUpperCase() + user.region?.slice(1)}
                  </p>
                )}
              </div>
            </div>

            {/* Anonymous Mode Toggle */}
            <div className="space-y-4 sm:space-y-6">
              <div className="p-4 sm:p-6 bg-purple-100/50 dark:bg-purple-900/20 rounded-xl sm:rounded-2xl">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 sm:gap-3 mb-2">
                      {user.is_anonymous_mode ? (
                        <EyeOff className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 dark:text-purple-400" />
                      ) : (
                        <Eye className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600 dark:text-emerald-400" />
                      )}
                      <h3 className="text-lg sm:text-xl font-bold">
                        {user.is_anonymous_mode ? 'Anonymous Mode' : 'Profile Mode'}
                      </h3>
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4">
                      {user.is_anonymous_mode
                        ? 'Your name and photo are hidden from strangers. They will see you as "Anonymous".'
                        : 'Your name and photo are visible to strangers during chat.'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={toggleAnonymousMode}
                  data-testid="toggle-anonymous-btn"
                  disabled={loading}
                  className={`w-full py-2.5 sm:py-3 rounded-xl font-medium transition-all text-sm sm:text-base ${
                    user.is_anonymous_mode
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-purple-600 hover:bg-purple-700 text-white'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {loading
                    ? 'Updating...'
                    : user.is_anonymous_mode
                    ? 'Switch to Profile Mode'
                    : 'Switch to Anonymous Mode'}
                </button>
              </div>

              {/* Info Cards */}
              <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="p-4 sm:p-6 glass rounded-xl sm:rounded-2xl">
                  <h4 className="font-semibold mb-1 sm:mb-2 text-sm sm:text-base">Current Region</h4>
                  <p className="text-xl sm:text-2xl font-bold text-gradient">
                    {user.region ? user.region.charAt(0).toUpperCase() + user.region.slice(1) : 'Not set'}
                  </p>
                </div>
                <div className="p-4 sm:p-6 glass rounded-xl sm:rounded-2xl">
                  <h4 className="font-semibold mb-1 sm:mb-2 text-sm sm:text-base">University</h4>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {user.campus || 'Not set'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
