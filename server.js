const express = require("express"), axios = require("axios"), fs = require("fs"), path = require("path"), ffmpeg = require("fluent-ffmpeg"), Jimp = require("jimp"), tar = require("tar"), FormData = require("form-data"), app = express(), PORT = process.env.PORT || 3000;

async function downloadVideo(url, outputPath) {
    const writer = fs.createWriteStream(outputPath);
    const response = await axios({ url, method: "GET", responseType: "stream" });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => writer.on("finish", resolve).on("error", reject));
}

function downscaleVideo(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath).outputOptions("-vf", "scale=iw/7:ih/7").save(outputPath).on("end", resolve).on("error", reject);
    });
}

function extractFrames(videoPath, outputDir) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
        ffmpeg(videoPath).output(path.join(outputDir, "frame-%04d.png")).on("end", resolve).on("error", reject).run();
    });
}

function createTar(outputTarPath, sourceDir) {
    return tar.c({ gzip: true, file: outputTarPath, cwd: sourceDir }, fs.readdirSync(sourceDir));
}

async function uploadToCatbox(filePath) {
    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append("fileToUpload", fs.createReadStream(filePath));
    const response = await axios.post("https://catbox.moe/user/api.php", form, { headers: form.getHeaders() });
    return response.data;
}

app.get("/vid", async (req, res) => {
    try {
        const videoUrl = req.headers["video-url"];
        if (!videoUrl) return res.status(400).json({ error: "Missing video-url header." });

        const tempDir = path.join(__dirname, "temp");
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

        const videoPath = path.join(tempDir, "video.mp4"), downscaledPath = path.join(tempDir, "video_scaled.mp4"), framesDir = path.join(tempDir, "frames"), tarPath = path.join(tempDir, "frames.tar.gz");

        await downloadVideo(videoUrl, videoPath);
        await downscaleVideo(videoPath, downscaledPath);
        await extractFrames(downscaledPath, framesDir);
        await createTar(tarPath, framesDir);
        
        const uploadLink = await uploadToCatbox(tarPath);
        res.json({ link: uploadLink });
        
        fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (err) {
        res.status(500).json({ error: "Internal server error" });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
