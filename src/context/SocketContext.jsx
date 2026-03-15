import { createContext, useContext, useRef } from 'react';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const socketRef = useRef(null);
  return (
    <SocketContext.Provider value={socketRef}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocketRef() {
  const ref = useContext(SocketContext);
  if (!ref) throw new Error('useSocketRef must be used within SocketProvider');
  return ref;
}
