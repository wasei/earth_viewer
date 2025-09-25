// src/components/CesiumViewer.jsx
import React, { forwardRef } from "react";
import "cesium/Build/Cesium/Widgets/widgets.css";

const CesiumViewer = forwardRef((props, ref) => {
  return <div ref={ref} id="cesiumContainer" />;
});

export default CesiumViewer;
