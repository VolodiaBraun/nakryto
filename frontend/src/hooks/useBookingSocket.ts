'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type StatusEvent  = (data: { tableId: string; datetime: string }) => void;
type LockEvent    = (data: { tableId: string; expiresAt?: string }) => void;

interface UseBookingSocketOptions {
  onBookingCreated?:   StatusEvent;
  onBookingCancelled?: StatusEvent;
  onTableLocked?:      LockEvent;
  onTableUnlocked?:    LockEvent;
}

export function useBookingSocket(
  slug: string,
  date: string,
  { onBookingCreated, onBookingCancelled, onTableLocked, onTableUnlocked }: UseBookingSocketOptions,
) {
  const socketRef    = useRef<Socket | null>(null);
  const createdRef   = useRef(onBookingCreated);
  const cancelledRef = useRef(onBookingCancelled);
  const lockedRef    = useRef(onTableLocked);
  const unlockedRef  = useRef(onTableUnlocked);
  const prevRoomRef  = useRef<string | null>(null);
  const [connected, setConnected] = useState(false);

  // Обновляем колбэки через ref, чтобы не пересоздавать подписки
  useEffect(() => { createdRef.current   = onBookingCreated;   }, [onBookingCreated]);
  useEffect(() => { cancelledRef.current = onBookingCancelled; }, [onBookingCancelled]);
  useEffect(() => { lockedRef.current    = onTableLocked;      }, [onTableLocked]);
  useEffect(() => { unlockedRef.current  = onTableUnlocked;    }, [onTableUnlocked]);

  // Создаём сокет один раз
  useEffect(() => {
    const socket = io(`${WS_URL}/ws`, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('booking_created',   (d) => createdRef.current?.(d));
    socket.on('booking_cancelled', (d) => cancelledRef.current?.(d));
    socket.on('table_locked',      (d) => lockedRef.current?.(d));
    socket.on('table_unlocked',    (d) => unlockedRef.current?.(d));

    return () => { socket.disconnect(); };
  }, []);

  // Переходим в нужную комнату при смене slug/date
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const room = `${slug}:${date}`;

    const join = () => {
      if (prevRoomRef.current && prevRoomRef.current !== room) {
        const [ps, pd] = prevRoomRef.current.split(':');
        socket.emit('leave_room', { slug: ps, date: pd });
      }
      socket.emit('join_room', { slug, date });
      prevRoomRef.current = room;
    };

    if (socket.connected) {
      join();
    } else {
      socket.once('connect', join);
    }

    return () => {
      socket.emit('leave_room', { slug, date });
      prevRoomRef.current = null;
    };
  }, [slug, date]);

  return { connected };
}
