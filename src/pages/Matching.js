import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Loader2, Home } from 'lucide-react';
import { toast } from 'sonner';
import api from '../utils/api';

const Matching = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState('checking'); // checking, searching, waiting, matched
  const intervalRef = useRef(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    
    // First check if user has region/campus set
    const checkUserProfile = async () => {
      try {
        const res = await api.get('/auth/me');
        if (!res.data.user?.region || !res.data.user?.campus) {
          toast.error('Please set your region and campus first');
          navigate('/dashboard', { replace: true });
          return;
        }
        // User has profile set, start matching
        startMatching();
      } catch (err) {
        toast.error('Please login first');
        navigate('/login', { replace: true });
      }
    };
    
    checkUserProfile();

    return () => {
      isMounted.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startMatching = async () => {
    try {
      const response = await api.post('/match/find');
      
      if (response.data.status === 'matched') {
        setStatus('matched');
        toast.success('Match found!');
        setTimeout(() => {
          if (isMounted.current) {
            navigate(`/chat/${response.data.room_id}`, { replace: true });
          }
        }, 1500);
      } else {
        setStatus('waiting');
        // Poll for match
        intervalRef.current = setInterval(async () => {
          try {
            const pollResponse = await api.post('/match/find');
            if (pollResponse.data.status === 'matched' && isMounted.current) {
              setStatus('matched');
              clearInterval(intervalRef.current);
              toast.success('Match found!');
              setTimeout(() => {
                if (isMounted.current) {
                  navigate(`/chat/${pollResponse.data.room_id}`, { replace: true });
                }
              }, 1500);
            }
          } catch (error) {
            console.error('Polling error:', error);
          }
        }, 3000);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to start matching');
      navigate('/dashboard', { replace: true });
    }
  };

  const handleCancel = async () => {
    try {
      await api.delete('/match/cancel');
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      navigate('/dashboard', { replace: true });
    } catch (error) {
      console.error('Cancel error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-emerald-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 relative overflow-hidden">
      {/* Home button */}
      <div className="absolute top-4 left-4 sm:top-6 sm:left-6 z-20">
        <button
          onClick={handleCancel}
          className="p-2 sm:p-3 glass rounded-full hover:bg-purple-500/10 transition-colors"
          title="Go Home"
        >
          <Home className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </div>

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-40 sm:w-64 h-40 sm:h-64 bg-purple-500/20 rounded-full blur-3xl pulse-glow" />
        <div className="absolute bottom-1/4 right-1/4 w-40 sm:w-64 h-40 sm:h-64 bg-emerald-500/20 rounded-full blur-3xl pulse-glow" style={{ animationDelay: '1s' }} />
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 sm:px-6">
        <div className="text-center max-w-md w-full" data-testid="matching-container">
          <div className="glass p-6 sm:p-12 rounded-2xl sm:rounded-3xl slide-in">
            {status === 'checking' ? (
              <>
                <div className="w-16 h-16 sm:w-24 sm:h-24 bg-gradient-to-br from-purple-600 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
                  <Loader2 className="w-8 h-8 sm:w-12 sm:h-12 text-white animate-spin" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4">Checking Profile...</h2>
                <p className="text-sm sm:text-base text-muted-foreground mb-4 sm:mb-6">Please wait...</p>
              </>
            ) : status === 'matched' ? (
              <>
                <div className="w-16 h-16 sm:w-24 sm:h-24 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
                  <Users className="w-8 h-8 sm:w-12 sm:h-12 text-white" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4">Match Found!</h2>
                <p className="text-sm sm:text-base text-muted-foreground mb-4 sm:mb-6">Connecting you to chat room...</p>
              </>
            ) : (
              <>
                <div className="relative w-16 h-16 sm:w-24 sm:h-24 mx-auto mb-4 sm:mb-6">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-600 to-emerald-500 rounded-full animate-ping opacity-75"></div>
                  <div className="relative w-16 h-16 sm:w-24 sm:h-24 bg-gradient-to-br from-purple-600 to-emerald-500 rounded-full flex items-center justify-center">
                    <Loader2 className="w-8 h-8 sm:w-12 sm:h-12 text-white animate-spin" />
                  </div>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4">Finding a Stranger...</h2>
                <p className="text-sm sm:text-base text-muted-foreground mb-4 sm:mb-6">
                  Looking for someone from your region and university.
                </p>
                <div className="flex gap-2 justify-center mb-4 sm:mb-6">
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-purple-600 rounded-full animate-bounce" />
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                </div>
              </>
            )}

            {status === 'waiting' && (
              <button
                onClick={handleCancel}
                data-testid="cancel-matching-btn"
                className="px-6 sm:px-8 py-2.5 sm:py-3 border-2 border-border rounded-xl font-medium hover:border-purple-600 transition-all duration-200 text-sm sm:text-base"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Matching;
