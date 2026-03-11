export const initSocket = (io) => {

  io.on('connection', (socket) => {
    console.log(`⚡ User connected: ${socket.id}`);

    // ─── JOIN SESSION ROOM ─────────────────────────────
    // Student/Teacher calls this when they open a session
    socket.on('join-session', (sessionCode) => {
      socket.join(sessionCode);
      console.log(`User ${socket.id} joined room: ${sessionCode}`);

      // Tell everyone in the room someone joined
      io.to(sessionCode).emit('user-joined', {
        message: `A user joined session ${sessionCode}`,
        socketId: socket.id
      });
    });

    // ─── NEW QUESTION POSTED ───────────────────────────
    // When a student posts a question, broadcast to whole room
    socket.on('new-question', (data) => {
      // data = { sessionCode, question }
      console.log(`New question in room ${data.sessionCode}:`, data.question);

      // Broadcast to EVERYONE in the room (including sender)
      io.to(data.sessionCode).emit('question-received', data.question);
    });

    // ─── QUESTION UPVOTED ──────────────────────────────
    socket.on('question-upvoted', (data) => {
      // data = { sessionCode, question }
      io.to(data.sessionCode).emit('question-updated', data.question);
    });

    // ─── QUESTION ANSWERED ────────────────────────────
    socket.on('question-answered', (data) => {
      // data = { sessionCode, question }
      io.to(data.sessionCode).emit('question-updated', data.question);
    });

    // ─── QUESTION DELETED ─────────────────────────────
    socket.on('question-deleted', (data) => {
      // data = { sessionCode, questionId }
      io.to(data.sessionCode).emit('question-removed', data.questionId);
    });

    // ─── SESSION ENDED ────────────────────────────────
    socket.on('session-ended', (sessionCode) => {
      io.to(sessionCode).emit('session-closed', {
        message: 'Teacher has ended this session'
      });
    });

    // ─── DISCONNECT ───────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
    });
  });

};