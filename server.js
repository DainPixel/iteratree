import express from "express";
import path from "path";
import { config } from "dotenv";
import bodyParser from "body-parser";
import OpenAI from "openai";

// Load environment variables
config();

const app = express();
const openai = new OpenAI();

// 환경 변수
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GENERATE_INSTRUCTION = process.env.GENERATE_INSTRUCTION;
const REITERATE_INSTRUCTION = process.env.REITERATE_INSTRUCTION;

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(process.cwd(), "public")));

// Main HTML
app.get("/", (req, res) => {
    res.sendFile(path.join(process.cwd(), "public", "home.html"));
});

// GPT Endpoint
app.post("/gpt", async (req, res) => {
    const { parentInputPrompt, parentRevisedPrompt, prompt, taskType } = req.body; // userInputPrompt → prompt로 변경

    // console.log("GPT Request Body:", req.body); // 요청 데이터 확인
    //console.log("GENERATE_INSTRUCTION:", process.env.GENERATE_INSTRUCTION);

    try {
        // 동적 instruction 구성
        const instruction = taskType === "reiterate"
            ? `Instruction: ${process.env.REITERATE_INSTRUCTION}\nPrompt: "${prompt}"`
            : `Instruction: ${process.env.GENERATE_INSTRUCTION}
               Parent Input Prompt: "${parentInputPrompt || "None"}"
               Parent Revised Prompt: "${parentRevisedPrompt || "None"}"
               User Input Prompt: "${prompt}"`;

        // 동적 시스템 메시지
        const systemMessage = taskType === "reiterate"
            ? "You are an assistant analyzing the prompt to provide helpful hints."
            : "You are an assistant generating a refined prompt by combining the user's input, the original prompt, and the revised prompt to ensure it aligns with the user's intent.";

        const completion = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                { role: "system", content: systemMessage },
                { role: "user", content: instruction },
            ],
        });

        // GPT 응답 확인
        console.log("GPT Response Content:", completion.choices[0].message.content);

        const optimizedPrompt = completion.choices[0].message.content.trim();
        const hints = completion.choices[0].message.content.split("\n");

        res.json({ optimizedPrompt, hints }); // 응답 반환

    } catch (error) {
        console.error("Error fetching hints from GPT:", error.response?.data || error.message);
        res.status(500).send("Error generating response from GPT");
    }
});


// DALL·E Endpoint
app.post("/dalle", async (req, res) => {
    const { prompt } = req.body;
  
    try {
      // 이미지 생성 요청
      const response = await openai.images.generate({
        model: "dall-e-3", // 모델 지정
        prompt: prompt, // 프롬프트 전달
        n: 1, // 생성할 이미지 개수
        size: "1024x1024", // 이미지 크기
      });

      // 생성된 이미지 URL과 수정된 프롬프트 로그 출력
      const imageUrl = response.data[0].url; // 추가
      const revisedPrompt = response.data[0].revised_prompt || "No revised prompt field";

      // console.log("Generated Image URL:", response.data[0].url);
      // console.log("Revised Prompt:", response.data[0].revised_prompt || "No revised prompt field");
      
      res.json({ url: imageUrl, revisedPrompt });

    } catch (error) {
      console.error("Error generating image:", error.message);
      res.status(500).send("Error generating image");
    }
  });

// Start Server
app.listen(3000, () => {
    console.log("Server is running at http://localhost:3000");
});
