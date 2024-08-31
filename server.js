const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

console.log('VAPID_PUBLIC_KEY:', process.env.VAPID_PUBLIC_KEY);
console.log('VAPID_PRIVATE_KEY:', process.env.VAPID_PRIVATE_KEY);

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
console.log('VAPID_PUBLIC_KEY:', process.env.VAPID_PUBLIC_KEY);
console.log('VAPID_PRIVATE_KEY:', process.env.VAPID_PRIVATE_KEY);

// In-memory storage for chats
const chats = new Map();

const webpush = require('web-push');

//const VAPID_PUBLIC_KEY = 'BC02JhYA5eBbV2vpiGdEmDEJDb8O1N6ptk1I9aVfh9yc4yso3Pcmtqm-Gu-3TMekLub0XOdfdXCCkuFGjlv1UMg';
//const VAPID_PRIVATE_KEY = '83K2zDaCpg1kOLKqGwTTIwknUrSAggtGpVxrWYP2tg0';

webpush.setVapidDetails(
  'mailto:wallawallaeats@email.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

//more logging
console.log('VAPID details set with:');
console.log('VAPID_PUBLIC_KEY:', process.env.VAPID_PUBLIC_KEY);
console.log('VAPID_PRIVATE_KEY:', process.env.VAPID_PRIVATE_KEY);

const subscriptions = new Map();

app.get('/vapidPublicKey', (req, res) => {
  res.json({ vapidPublicKey: process.env.VAPID_PUBLIC_KEY});
});

app.post('/api/save-subscription/', express.json(), (req, res) => {
  const subscription = req.body.subscription;
  const username = req.body.username; // Get username from request body

  console.log('Received subscription for user:', username, subscription);

  subscriptions.set(username, subscription);

  res.json({data: {success: true}});
});

app.use(express.static('public'));

// Serve index.html for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
  console.log('New client connected', socket.id);
  let username = null;

  socket.on('setUsername', (newUsername) => {
    username = newUsername;
    socket.username = newUsername;  // Add this line
    socket.emit('usernameSet', username);
    console.log(`Username set: ${username}`);
  });

  socket.on('createChat', (chatName) => {
    const chatId = uuidv4();
    chats.set(chatId, { name: chatName, messages: [] });
    socket.emit('chatCreated', { id: chatId, name: chatName });
    console.log(`Chat created: ${chatId} - ${chatName}`);
  });

  socket.on('joinChat', (chatId) => {
    console.log(`Attempting to join chat: ${chatId}`);
    if (chats.has(chatId)) {
      const chat = chats.get(chatId);
      if (!socket.rooms.has(chatId)) {
        socket.join(chatId);
        console.log(`User ${username || 'Unknown'} joined chat: ${chatId}`);
      } else {
        console.log(`User ${username || 'Unknown'} already in chat: ${chatId}`);
      }
      socket.emit('chatJoined', { chatId, chatName: chat.name, messages: chat.messages });
    } else {
      console.log(`Chat not found: ${chatId}`);
      socket.emit('error', 'Chat not found');
    }
  });

  socket.on('sendMessage', ({ chatId, message }) => {
    if (chats.has(chatId)) {
      const chat = chats.get(chatId);
      const fullMessage = `${username}: ${message}`;
      chat.messages.push(fullMessage);
      io.to(chatId).emit('newMessage', fullMessage);
  
      // Send push notifications to all users in the chat except the sender
      const chatUsers = getChatUsers(chatId);
      
      chatUsers.forEach(chatUsername => {
        if (chatUsername !== username) {
          const subscription = subscriptions.get(chatUsername);
          if (subscription) {
            console.log('Sending notification to:', chatUsername);
            const payload = JSON.stringify({
              title: 'New Message in ' + getChatName(chatId),
              body: `${username}: ${message}`
            });
            webpush.sendNotification(subscription, payload)
              .then(() => console.log('Notification sent successfully to', chatUsername))
              .catch(error => {
                console.error('Error sending notification to', chatUsername, error);
                subscriptions.delete(chatUsername);
              });
          } else {
            console.log('No subscription found for user:', chatUsername);
          }
        }
      });
    }
  });
   

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });

  socket.on('removeChat', async (chatId) => {
    // Remove the chat from this user's list in localStorage
    let userChats = JSON.parse(socket.handshake.auth.userChats || '[]');
    userChats = userChats.filter(id => id !== chatId);
    socket.handshake.auth.userChats = JSON.stringify(userChats);

    // Remove the user from the chat room
    socket.leave(chatId);

    // Notify the client that the chat has been removed
    socket.emit('chatRemoved', chatId);
  });
  
});

function getChatUsers(chatId) {
  const room = io.sockets.adapter.rooms.get(chatId);
  if (!room) return [];
  return Array.from(room).map(socketId => {
    const socket = io.sockets.sockets.get(socketId);
    return socket ? socket.username : null;
  }).filter(username => username !== null);
}

function getChatName(chatId) {
  const chat = chats.get(chatId);
  return chat ? chat.name : 'Unknown Chat';
}

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));