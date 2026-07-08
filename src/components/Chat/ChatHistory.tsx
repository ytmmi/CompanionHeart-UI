import React from "react";

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: "25vw",
    height: "100vh",
    backgroundColor: "#e0e0e0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#888",
    fontSize: 18,
    fontWeight: 500,
    userSelect: "none",
  },
};

const ChatHistory: React.FC = () => {
  return <div style={styles.container}>聊天记录</div>;
};

export default ChatHistory;
