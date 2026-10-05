import { io } from 'socket.io-client';
import { SERVER_URL } from './config';

export const initSocket = async () => {
    const options = {
        'force new connection': true,
        reconnectionAttempt: 'Infinity',
        timeout: 10000,
        transports: ['websocket'],
    };
    return io(SERVER_URL, options);
}
