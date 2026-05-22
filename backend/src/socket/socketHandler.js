export const initSocket = (io) => {

  io.on('connection', (socket) => {
    console.log(`⚡ User connected: ${socket.id}`);

    socket.on('join-session', (sessionCode) => {
      socket.join(sessionCode);
      console.log(`User ${socket.id} joined room: ${sessionCode}`);

      io.to(sessionCode).emit('user-joined', {
        message: `A user joined session ${sessionCode}`,
        socketId: socket.id
      });
    });

    socket.on('new-question', (data) => {
      console.log(`New question in room ${data.sessionCode}:`, data.question);

      io.to(data.sessionCode).emit('question-received', data.question);
    });

    socket.on('question-upvoted', (data) => {
      io.to(data.sessionCode).emit('question-updated', data.question);
    });

    socket.on('question-answered', (data) => {
      io.to(data.sessionCode).emit('question-updated', data.question);
    });

    socket.on('question-deleted', (data) => {
      io.to(data.sessionCode).emit('question-removed', data.questionId);
    });

    socket.on('session-ended', (sessionCode) => {
      io.to(sessionCode).emit('session-closed', {
        message: 'Teacher has ended this session'
      });
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
    });
    socket.on('media-shared', (data) => {
    // data = { sessionCode, media }
    // Broadcast to everyone in session
    io.to(data.sessionCode).emit('media-received', data.media);
    });
    socket.on('media-deleted', (data) => {
    // data = { sessionCode, publicId }
    io.to(data.sessionCode).emit('media-removed', data.publicId);
    });
  });

};