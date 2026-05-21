import { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';

export function useNetworkStatus() {
  const [status, setStatus] = useState({
    isConnected: false,
    isInternetReachable: false,
    isOffline: true,
    connectionType: null,
    hasCheckedInitialStatus: false,
  });

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const fullyConnected =
        state.isConnected === true && state.isInternetReachable !== false;

      setStatus({
        isConnected: fullyConnected,
        isInternetReachable: state.isInternetReachable !== false,
        isOffline: !fullyConnected,
        connectionType: state.type ?? null,
        hasCheckedInitialStatus: true,
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return status;
}

export default useNetworkStatus;
