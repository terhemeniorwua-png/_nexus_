const { latestActivity } = require("../services/activity.service");

async function listActivity(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const activities = await latestActivity(req.workspace._id, limit);

    res.json({
      success: true,
      activities: activities.map((entry) => entry.toJSON()),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { listActivity };







// import { disconnectSocket } from "@/lib/websocket";

// const handleLogout = () => {
//   localStorage.removeItem("token");
//   disconnectSocket(); // Clean up current socket connection
//   window.location.href = "/login";
// };




// import { useEffect } from "react";
// import { getSocket } from "@/lib/websocket"; // Adjust path to where your file is

// export default function ChatRoom() {
//   useEffect(() => {
//     // Initialize socket connection
//     const socket = getSocket();

//     if (!socket) return;

//     // Listen for incoming messages from server
//     socket.on("receiveMessage", (data) => {
//       console.log("New message received:", data);
//     });

//     // Cleanup listeners when component unmounts
//     return () => {
//       socket.off("receiveMessage");
//     };
//   }, []);

//   const handleSendMessage = () => {
//     const socket = getSocket();
//     if (socket) {
//       socket.emit("sendMessage", { text: "Hello server!" });
//     }
//   };

//   return (
//     <div>
//       <button onClick={handleSendMessage}>Send Message</button>
//     </div>
//   );
// }