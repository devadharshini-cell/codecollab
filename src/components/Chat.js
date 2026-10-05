import React, { useEffect, useRef } from 'react';
import { useState } from 'react';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';

// Reuses the room's already-joined socket (passed down from Editorpage) instead
// of opening a second, disconnected socket — that second socket never actually
// joined the room, so messages sent through it couldn't be scoped per-room.
const Chat = ({ socketRef, roomId, username }) => {
	const [chat, setChat] = useState([]);
	const [message, setMessage] = useState('');
	const bottomRef = useRef(null);

	useEffect(() => {
		const socket = socketRef?.current;
		if (!socket) return;

		const onMessage = ({ name, message }) => {
			setChat((prev) => [...prev, { name, message }]);
		};
		const onHistory = (history) => {
			setChat(history.map(({ name, message }) => ({ name, message })));
		};

		socket.on('message', onMessage);
		socket.on('chat:history', onHistory);

		return () => {
			socket.off('message', onMessage);
			socket.off('chat:history', onHistory);
		};
	}, [socketRef]);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [chat]);

	const onMessageSubmit = (e) => {
		e.preventDefault();
		const trimmed = message.trim();
		if (!trimmed || !socketRef?.current) return;
		socketRef.current.emit('message', { roomId, name: username, message: trimmed });
		setMessage('');
	};

	return (
		<>
			<div className="render-chat">
				<h3 style={{ color: 'white', textAlign: 'center', fontFamily: '\'Baloo Bhaijaan 2\' , cursive', borderBottom: '1px solid white', margin: '1rem' }}>Chat Log</h3>
				{chat.map(({ name, message }, index) => (
					<div key={index}>
						<h3 className='text-name'>
							{name}: <span className='text-message'>{message}</span>
						</h3>
					</div>
				))}
				<div ref={bottomRef} />
			</div>
			<div className='textbox-message'>
				<Form onSubmit={onMessageSubmit}>
					<InputGroup style={{ width: '100%' }} className="mb-3">
						<Form.Control
							name="message"
							type="text"
							onChange={(e) => setMessage(e.target.value)}
							value={message}
							placeholder="Message"
						/>
						<Button type="submit" style={{ boxShadow: 'none', backgroundColor: '#4d67c3', border: 'none' }} id="button-addon2">
							Send
						</Button>
					</InputGroup>
				</Form>
			</div>
		</>
	)
}

export default Chat
