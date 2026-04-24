import { useEffect, useRef, useState } from 'react';

type StreamMessage = {
  channel: string;
  data: any;
};

export function useStream(channels: string[]) {
  const [data, setData] = useState<Record<string, any>>({});
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // If the UI is on 3000, the API is on 3001
    const host = window.location.hostname;
    const wsUrl = `${protocol}//${host}:3001/ws/stream`;

    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log('WS: Connected');
      channels.forEach(channel => {
        ws.current?.send(JSON.stringify({ action: 'subscribe', channel }));
      });
    };

    ws.current.onmessage = (event) => {
      const msg: StreamMessage = JSON.parse(event.data);
      setData(prev => ({
        ...prev,
        [msg.channel]: msg.data
      }));
    };

    ws.current.onclose = () => {
      console.log('WS: Disconnected');
    };

    return () => {
      ws.current?.close();
    };
  }, [JSON.stringify(channels)]);

  return { data, status: ws.current?.readyState };
}
