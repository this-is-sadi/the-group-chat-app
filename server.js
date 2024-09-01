const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

console.log('VAPID_PUBLIC_KEY:', process.env.VAPID_PUBLIC_KEY);
console.log('VAPID_PRIVATE_KEY:', process.env.VAPID_PRIVATE_KEY);

const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));


// Define Chat schema and model
const chatSchema = new mongoose.Schema({
  name: String,
  messages: [String]
});

const Chat = mongoose.model('Chat', chatSchema);

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

const webpush = require('web-push');

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

  // Set the username for the socket
  socket.on('setUsername', (newUsername) => {
    username = newUsername;
    socket.username = newUsername;
    socket.emit('usernameSet', username);
    console.log(`Username set: ${username}`);
  });

  // Create a new chat and save it to MongoDB
  socket.on('createChat', async (chatName) => {
    const chat = new Chat({ name: chatName, messages: [] });
    await chat.save();
    socket.emit('chatCreated', { id: chat._id, name: chatName });
    console.log(`Chat created: ${chat._id} - ${chatName}`);
  });

  // Join an existing chat by fetching it from MongoDB
  socket.on('joinChat', async (chatId) => {
    console.log(`Attempting to join chat: ${chatId}`);
    const chat = await Chat.findById(chatId);
    if (chat) {
      socket.join(chatId);
      console.log(`User ${username || 'Unknown'} joined chat: ${chatId}`);
      socket.emit('chatJoined', { chatId, chatName: chat.name, messages: chat.messages });
    } else {
      console.log(`Chat not found: ${chatId}`);
      socket.emit('error', 'Chat not found');
    }
  });

  // Send a message in a chat and save it to MongoDB
  socket.on('sendMessage', async ({ chatId, message }) => {
    const chat = await Chat.findById(chatId);
    if (chat) {
      const fullMessage = `${username}: ${message}`;
      chat.messages.push(fullMessage);
      await chat.save();
      io.to(chatId).emit('newMessage', fullMessage);

      // Send push notifications to all users in the chat except the sender
      const chatUsers = getChatUsers(chatId);
      chatUsers.forEach(chatUsername => {
        if (chatUsername !== username) {
          const subscription = subscriptions.get(chatUsername);
          if (subscription) {
            console.log('Sending notification to:', chatUsername);
            const payload = JSON.stringify({
              title: 'New Message in ' + chat.name,
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

  // Handle client disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });

  // Remove a chat from the user's list and leave the chat room
  socket.on('removeChat', async (chatId) => {
    let userChats = JSON.parse(socket.handshake.auth.userChats || '[]');
    userChats = userChats.filter(id => id !== chatId);
    socket.handshake.auth.userChats = JSON.stringify(userChats);
    socket.leave(chatId);
    socket.emit('chatRemoved', chatId);
  });
});

// Helper function to get users in a chat room
function getChatUsers(chatId) {
  const room = io.sockets.adapter.rooms.get(chatId);
  if (!room) return [];
  return Array.from(room).map(socketId => {
    const socket = io.sockets.sockets.get(socketId);
    return socket ? socket.username : null;
  }).filter(username => username !== null);
}

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));