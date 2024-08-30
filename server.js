const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// In-memory storage for chats
const chats = new Map();

app.use(express.static('public'));

// Serve index.html for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
  console.log('New client connected');
  let username = null;

  socket.on('setUsername', (newUsername) => {
    username = newUsername;
    socket.emit('usernameSet', username);
  });

  socket.on('createChat', (chatName) => {
    const chatId = uuidv4();
    chats.set(chatId, { name: chatName, messages: [] });
    socket.emit('chatCreated', { id: chatId, name: chatName });
  });

  socket.on('getChats', () => {
    const chatList = Array.from(chats.entries()).map(([id, chat]) => ({
      id,
      name: chat.name
    }));
    socket.emit('chatList', chatList);
  });

  socket.on('joinChat', (chatId) => {
    if (chats.has(chatId)) {
      const chat = chats.get(chatId);
      socket.join(chatId);
      socket.emit('chatJoined', { chatId, chatName: chat.name, messages: chat.messages });
    } else {
      socket.emit('error', 'Chat not found');
    }
  });

  socket.on('sendMessage', ({ chatId, message }) => {
    if (chats.has(chatId) && username) {
      const chat = chats.get(chatId);
      const fullMessage = `${username}: ${message}`;
      chat.messages.push(fullMessage);
      io.to(chatId).emit('newMessage', fullMessage);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));