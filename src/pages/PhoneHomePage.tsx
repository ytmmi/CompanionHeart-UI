// PLATFORM: Group B（Android 手机）专用界面
// 暂时显示占位，后续开发

import React from "react";

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100vw",
    height: "100vh",
    fontSize: 24,
    color: "#888",
  },
};

const PhoneHomePage: React.FC = () => {
  return <div style={styles.container}>首页</div>;
};

export default PhoneHomePage;
