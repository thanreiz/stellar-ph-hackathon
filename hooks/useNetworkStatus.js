import { useState, useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';

const STABLE_CONNECTION_MS = 3000;

export function useNetworkStatus() {
  const [status, setStatus] = useState({
    isConnected: false,
    isInternetReachable: false,
    isOffline: true,
    connectionType: null,
    hasCheckedInitialStatus: false,
  });

  const stableTimer = useRef(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const fullyConnected =
        state.isConnected === true && state.isInternetReachable === true;

      if (!fullyConnected) {
        // Lose connection immediately — clear any pending "come online" timer.
        clearTimeout(stableTimer.current);
        setStatus({
          isConnected: false,
          isInternetReachable: false,
          isOffline: true,
          connectionType: state.type ?? null,
          hasCheckedInitialStatus: true,
        });
      } else {
        // Only confirm online after 3 stable seconds.
        clearTimeout(stableTimer.current);
        stableTimer.current = setTimeout(() => {
          setStatus({
            isConnected: true,
            isInternetReachable: true,
            isOffline: false,
            connectionType: state.type ?? null,
            hasCheckedInitialStatus: true,
          });
        }, STABLE_CONNECTION_MS);
      }
    });

    return () => {
      unsubscribe();
      clearTimeout(stableTimer.current);
    };
  }, []);

  return status;
}

export default useNetworkStatus;
