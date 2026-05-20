import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

export default function useNetworkStatus() {
  const [networkState, setNetworkState] = useState({
    isConnected: true,
    isInternetReachable: true,
    isOffline: false,
    connectionType: null,
    hasCheckedInitialStatus: false
  });

  useEffect(() => {
    let isMounted = true;

    async function loadInitialNetworkState() {
      try {
        const state = await NetInfo.fetch();

        if (!isMounted) return;

        const isConnected = Boolean(state.isConnected);
        const isInternetReachable = state.isInternetReachable !== false;
        const isOffline = !isConnected || !isInternetReachable;

        setNetworkState({
          isConnected,
          isInternetReachable,
          isOffline,
          connectionType: state.type,
          hasCheckedInitialStatus: true
        });
      } catch {
        if (!isMounted) return;

        setNetworkState({
          isConnected: false,
          isInternetReachable: false,
          isOffline: true,
          connectionType: null,
          hasCheckedInitialStatus: true
        });
      }
    }

    loadInitialNetworkState();

    const unsubscribe = NetInfo.addEventListener((state) => {
      const isConnected = Boolean(state.isConnected);
      const isInternetReachable = state.isInternetReachable !== false;
      const isOffline = !isConnected || !isInternetReachable;

      setNetworkState({
        isConnected,
        isInternetReachable,
        isOffline,
        connectionType: state.type,
        hasCheckedInitialStatus: true
      });
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return networkState;
}
