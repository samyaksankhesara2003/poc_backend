import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

//  const transcribeChunk = async (chunk) => {
//   const baseDir = "realtime";
//   const outDir = "realtime_outputs";

//   if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir);
//   if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

//   const timestamp = Date.now();
//   const webmPath = path.join(baseDir, `${timestamp}.webm`);
//   const wavPath = path.join(baseDir, `${timestamp}.wav`);

//   // Save chunk
//   fs.writeFileSync(webmPath, Buffer.from(chunk));

//   // Convert to wav
//   await execAsync(
//     `ffmpeg -i "${webmPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}"`
//   );

//   // Whisper
//   await execAsync(
//     `/home/techuz/.local/bin/whisper "${wavPath}" --model small --language en --output_format txt --output_dir ${outDir}`
//   );

//   const txtPath = path.join(outDir, `${timestamp}.txt`);
//   if (!fs.existsSync(txtPath)) return "";

//   return fs.readFileSync(txtPath, "utf8").trim();
// };
const transcribeChunk = async (arrayBuffer) => {
    const baseDir = "realtime";
    const outDir = "realtime_outputs";
  
    if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  
    const timestamp = Date.now();
    const webmPath = path.join(baseDir, `${timestamp}.webm`);
    const wavPath = path.join(baseDir, `${timestamp}.wav`);
  
    // Convert ArrayBuffer to Buffer and save
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(webmPath, buffer);
  
    console.log(`Saved audio file: ${webmPath} (${buffer.length} bytes)`);
  
    try {
      // Convert to wav
      await execAsync(
        `ffmpeg -i "${webmPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${wavPath}" -y`
      );
  
      console.log('Audio converted to WAV');
  
      // Whisper transcription
      await execAsync(
        `/home/techuz/.local/bin/whisper "${wavPath}" --model small --language en --output_format txt --output_dir ${outDir}`
      );
  
      const txtPath = path.join(outDir, `${timestamp}.txt`);
      
      if (!fs.existsSync(txtPath)) {
        console.error('Transcription file not found');
        return "";
      }
  
      const text = fs.readFileSync(txtPath, "utf8").trim();
      
      // Optional: Clean up files
      // fs.unlinkSync(webmPath);
      // fs.unlinkSync(wavPath);
      // fs.unlinkSync(txtPath);
  
      return text;
    } catch (error) {
      console.error('Transcription error:', error.message);
      return "";
    }
  };

export const realtimeService = {
    transcribeChunk
}
