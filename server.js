const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

console.log('VAPID_PUBLIC_KEY:', process.env.VAPID_PUBLIC_KEY);
console.log('VAPID_PRIVATE_KEY:', process.env.VAPID_PRIVATE_KEY);

const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
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

const webpush = require('web-push');

webpush.setVapidDetails(
  'mailto:wallawallaeats@email.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const subscriptions = new Map();

// Helper function to get users in a chat room
function getChatUsers(chatId) {
  const room = io.sockets.adapter.rooms.get(chatId);
  if (!room) return [];
  return Array.from(room).map(socketId => {
    const socket = io.sockets.sockets.get(socketId);
    return socket ? socket.username : null;
  }).filter(username => username !== null);
}

function sendPushNotifications(chatId, chatName, senderUsername, message) {
  const chatUsers = getChatUsers(chatId);
  chatUsers.forEach(chatUsername => {
    if (chatUsername !== senderUsername) {
      const subscription = subscriptions.get(chatUsername);
      if (subscription) {
        console.log('Sending notification to:', chatUsername);
        const payload = JSON.stringify({
          title: 'New Message in ' + chatName,
          body: `${senderUsername}: ${message}`
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

  socket.on('joinChat', async (chatId) => {
    try {
      const chat = await Chat.findById(chatId);
      if (chat) {
        socket.join(chatId);
        socket.emit('chatJoined', { chatId, chatName: chat.name, messages: chat.messages });
      } else {
        socket.emit('error', 'Chat not found');
      }
    } catch (error) {
      console.error('Error joining chat:', error);
      socket.emit('error', 'Failed to join chat');
    }
  });

    // Create a new chat and save it to MongoDB
  socket.on('createChat', async (chatName) => {
    try {
      const chat = new Chat({ name: chatName, messages: [] });
      await chat.save();
      socket.emit('chatCreated', { id: chat._id, name: chatName });
      console.log(`Chat created: ${chat._id} - ${chatName}`);
    } catch (error) {
      console.error('Error creating chat:', error);
      socket.emit('error', 'Failed to create chat');
    }
  });
  
  // Join an existing chat by fetching it from MongoDB
  socket.on('sendMessage', async ({ chatId, message }) => {
    try {
      const chat = await Chat.findById(chatId);
      if (!chat) {
        throw new Error('Chat not found');
      }
  
      const fullMessage = `${username}: ${message}`;
      chat.messages.push(fullMessage);
      await chat.save();
  
      io.to(chatId).emit('newMessage', fullMessage);
  
      // Send push notifications
      sendPushNotifications(chatId, chat.name, username, message);
  
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', 'Failed to send message');
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

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));