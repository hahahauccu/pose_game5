const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const poseImage = document.getElementById('poseImage');

let detector, rafId;
let currentPoseIndex = 0;
const totalPoses = 7;
const similarityThreshold = 0.7;
let standardKeypointsList = [];
let poseOrder = [];

function shufflePoseOrder() {
  poseOrder = Array.from({ length: totalPoses }, (_, i) => i + 1);
  for (let i = poseOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [poseOrder[i], poseOrder[j]] = [poseOrder[j], poseOrder[i]];
  }
  console.log("本次順序：", poseOrder);
}

function resolvePoseImageName(base) {
  const png = `poses/${base}.png`;
  const PNG = `poses/${base}.PNG`;
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(png);
    img.onerror = () => resolve(PNG);
    img.src = png;
  });
}

async function loadStandardKeypoints() {
  for (const i of poseOrder) {
    const res = await fetch(`poses/pose${i}.json`);
    const json = await res.json();
    const keypoints = json.keypoints || json;
    standardKeypointsList.push({
      id: i,
      keypoints,
      imagePath: await resolvePoseImageName(`pose${i}`)
    });
  }
}

function drawKeypoints(kps, color, radius, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  kps.forEach(kp => {
    if (kp.score > 0.4) {
      ctx.beginPath();
      ctx.arc(kp.x, kp.y, radius, 0, 2 * Math.PI);
      ctx.fill();
    }
  });
  ctx.globalAlpha = 1.0;
}

function compareKeypoints(a, b) {
  let sum = 0, count = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    if (a[i].score > 0.4 && b[i].score > 0.4) {
      const dx = a[i].x - b[i].x;
      const dy = a[i].y - b[i].y;
      sum += Math.hypot(dx, dy);
      count++;
    }
  }
  if (!count) return 0;
  return 1 / (1 + (sum / count) / 100);
}

async function detect() {
  const result = await detector.estimatePoses(video);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const currentPose = standardKeypointsList[currentPoseIndex];
  if (currentPose) drawKeypoints(currentPose.keypoints, 'blue', 6, 0.5);

  if (result.length > 0) {
    const user = result[0].keypoints;
    drawKeypoints(user, 'red', 6, 1.0);

    const sim = compareKeypoints(user, currentPose.keypoints);
    if (sim > similarityThreshold) {
      currentPoseIndex++;
      if (currentPoseIndex < totalPoses) {
        poseImage.src = standardKeypointsList[currentPoseIndex].imagePath;
      } else {
        cancelAnimationFrame(rafId);
        alert('🎉 全部完成！');
        return;
      }
    }
  }

  rafId = requestAnimationFrame(detect);
}

async function startGame() {
  startBtn.disabled = true;
  startBtn.style.display = 'none';

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { exact: 'environment' },
      width: { ideal: 640 },
      height: { ideal: 480 }
    },
    audio: false
  });
  video.srcObject = stream;
  await video.play();

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  ctx.setTransform(-1, 0, 0, 1, canvas.width, 0);

  try {
    await tf.setBackend('webgl'); await tf.ready();
  } catch {
    try {
      await tf.setBackend('wasm'); await tf.ready();
    } catch {
      await tf.setBackend('cpu'); await tf.ready();
    }
  }

  detector = await poseDetection.createDetector(
    poseDetection.SupportedModels.MoveNet,
    { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
  );

  shufflePoseOrder();
  await loadStandardKeypoints();
  poseImage.src = standardKeypointsList[0].imagePath;
  detect();
}

startBtn.addEventListener("click", startGame);

document.body.addEventListener('click', () => {
  if (!standardKeypointsList.length) return;

  currentPoseIndex++;
  if (currentPoseIndex < totalPoses) {
    poseImage.src = standardKeypointsList[currentPoseIndex].imagePath;
  } else {
    cancelAnimationFrame(rafId);
    alert('🎉 全部完成！');
  }
});
