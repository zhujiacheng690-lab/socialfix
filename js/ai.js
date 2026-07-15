(function(){
  const REQUEST_TIMEOUT_MS = 45000;

  const AI_CONFIG = {
    apiUrl: "https://api.deepseek.com/chat/completions",
    apiFormat: "chat_completions",
    // 仅用于临时展示。
    // 该Key会暴露在浏览器和GitHub源码中。
    // 展示完成后立即删除或撤销此Key。
    apiKey: "",
    model: "deepseek-v4-flash"
  };

  const TRAINING_AGENT_PROMPT = [
    "你是SocialFix中的场景训练Agent，面向12至22岁的青少年。",
    "你的任务是：扮演当前社交场景中的人物；根据用户回复自然推进对话；评价用户刚才的沟通表现；给出四维评分；提供一个简短、可操作的提示；在3至5轮后结束场景并总结。",
    "角色扮演规则：符合当前人物身份、关系、背景和情绪；每次只回复1至3句话；不要第一轮就立刻被说服；也不要为了增加难度而无限激化矛盾；对方的反应应随着用户表达改变；语言要像真实同学、朋友、家长或老师；不要像心理咨询教材；不要替用户作答；不辱骂、不羞辱、不威胁用户。",
    "评分规则：共情度、边界感、建设性、情绪降级分别0至100；礼貌不等于高分；共情不等于同意；边界不等于强硬；不奖励虚假道歉、讨好、撒谎、操纵或报复；简短但有效的回复也可以获得高分。",
    "反馈规则：good只指出一个具体优点；improve只指出一个最重要问题；hint只给方向，不直接提供完整答案；不评价用户人格；不使用“情商低”等标签。",
    "如果request_type是hint_only：不要推进剧情，role_reply留空，scores可给0，feedback.hint只给一个简短方向，不能直接给完整答案。",
    "如果request_type是example_only：不要推进剧情，role_reply填写一条自然、简短、可参考的用户回复；feedback.hint写“这只是参考，不是唯一正确答案。”；不要把示范写成公关稿。",
    "安全规则：如果内容涉及校园欺凌、人身威胁、勒索、跟踪、性骚扰、隐私照片传播、自伤或伤害他人，不继续普通游戏化训练，应在回复中建议用户联系可信任成年人、学校工作人员或当地紧急服务。",
    "只返回合法JSON，不输出Markdown，不输出JSON之外的解释。",
    "返回格式：{\"type\":\"training_turn\",\"role_reply\":\"角色对用户的下一句回复\",\"scores\":{\"empathy\":0,\"boundary\":0,\"constructiveness\":0,\"deescalation\":0},\"feedback\":{\"good\":\"这句话做得好的一个地方\",\"improve\":\"最需要改善的一个地方\",\"hint\":\"下一轮的简短提示\"},\"state\":{\"emotion\":0,\"round\":1,\"finished\":false},\"summary\":\"\"}"
  ].join("\\n");

  const HELP_AGENT_PROMPT = [
    "你是SocialFix的社交求助Agent，面向12至22岁的青少年。",
    "你的任务是帮助用户理解具体社交困难，并提供自然、尊重、有边界、可以实际使用的建议。",
    "工作方式：简要总结发生了什么；区分事实和推测；分析双方可能的需要，但不要武断读心；找出当前最大的沟通风险；提供3个清楚、可执行的步骤；生成自然版、温和版、坚定版三种参考回复；说明哪些表达不建议使用；必要时提出一个有帮助的后续问题。",
    "回复原则：不武断判断谁是好人、谁是坏人；不要求用户无原则道歉或退让；不鼓励讨好、欺骗、操纵、报复、冷暴力或公开羞辱；不使用PUA方法；不提供虚假借口；尊重他人的拒绝；用户可以合理表达边界；回复适合真实青少年日常交流；不要写成正式公关稿；不进行心理疾病诊断；不把一次事件上升为人格判断；明确提示“对方可能在意什么”只是一种可能性。",
    "安全规则：涉及持续欺凌、威胁、勒索、跟踪、性骚扰、隐私传播、自伤、伤人或成年人对未成年人的不当接触时，优先提供安全分流建议。",
    "只返回合法JSON，不输出Markdown或额外解释。",
    "返回格式：{\"type\":\"help\",\"situation_summary\":\"\",\"possible_other_need\":\"\",\"user_need\":\"\",\"main_risk\":\"\",\"steps\":[\"\",\"\",\"\"],\"replies\":{\"natural\":\"\",\"gentle\":\"\",\"firm\":\"\"},\"avoid\":[\"\"],\"follow_up_question\":\"\",\"risk_level\":\"normal\",\"safety_message\":\"\"}"
  ].join("\\n");

  function withTimeout(ms){
    const controller = new AbortController();
    const timer = setTimeout(function(){ controller.abort(); }, ms);
    return { controller, timer };
  }

  function extractOutputText(data){
    const choices = data && Array.isArray(data.choices) ? data.choices : [];
    if(choices[0] && choices[0].message && typeof choices[0].message.content === "string"){
      return choices[0].message.content;
    }
    if(data && typeof data.output_text === "string" && data.output_text.trim()){
      return data.output_text;
    }
    const output = data && Array.isArray(data.output) ? data.output : [];
    for(const item of output){
      const content = Array.isArray(item.content) ? item.content : [];
      for(const part of content){
        if(part && part.type === "output_text" && typeof part.text === "string"){
          return part.text;
        }
      }
    }
    throw new Error("AI返回中没有可读取的文本。");
  }

  function buildRequestBody({ mode, instructions, payload }){
    const input = JSON.stringify({ mode, ...payload });
    if(AI_CONFIG.apiFormat === "chat_completions"){
      return {
        model: AI_CONFIG.model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: input }
        ]
      };
    }
    return {
      model: AI_CONFIG.model,
      instructions,
      input
    };
  }

  function cleanJsonText(text){
    return String(text || "")
      .trim()
      .replace(/^```json\\s*/i, "")
      .replace(/^```\\s*/i, "")
      .replace(/```$/i, "")
      .trim();
  }

  function parseJsonResponse(text){
    const cleaned = cleanJsonText(text);
    try{
      return JSON.parse(cleaned);
    }catch(err){
      const match = cleaned.match(/\\{[\\s\\S]*\\}/);
      if(match) return JSON.parse(match[0]);
      throw new Error("AI返回格式异常，请重试。");
    }
  }

  async function callAI({ mode, instructions, payload }){
    if(!AI_CONFIG.apiKey || AI_CONFIG.apiKey.includes("在这里")){
      throw new Error("请先在 js/ai.js 的 AI_CONFIG.apiKey 填入临时API Key。");
    }
    const timeout = withTimeout(REQUEST_TIMEOUT_MS);
    try{
      const response = await fetch(AI_CONFIG.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + AI_CONFIG.apiKey
        },
        signal: timeout.controller.signal,
        body: JSON.stringify(buildRequestBody({ mode, instructions, payload }))
      });
      if(!response.ok){
        const detail = await response.text();
        throw new Error("API请求失败：" + response.status + " " + detail.slice(0, 180));
      }
      const data = await response.json();
      return parseJsonResponse(extractOutputText(data));
    }catch(err){
      if(err && err.name === "AbortError") throw new Error("请求超时，请稍后重试。");
      if(err && /JSON/.test(err.message)) throw new Error("AI返回格式异常，请重试。");
      if(err && (err.message === "Load failed" || err.message === "Failed to fetch")){
        throw new Error("网络请求没有成功发到 DeepSeek。请检查浏览器/网络是否拦截 api.deepseek.com，或换 Chrome/关闭内容拦截器后重试。");
      }
      throw err;
    }finally{
      clearTimeout(timeout.timer);
    }
  }

  window.SocialFixAI = {
    AI_CONFIG,
    TRAINING_AGENT_PROMPT,
    HELP_AGENT_PROMPT,
    callAI,
    extractOutputText,
    buildRequestBody,
    cleanJsonText,
    parseJsonResponse
  };

  document.addEventListener("DOMContentLoaded", function(){
    const input = document.getElementById("apiKeyInput");
    const button = document.getElementById("saveApiKeyBtn");
    const status = document.getElementById("apiKeyStatus");
    if(!input || !button || !status) return;
    button.addEventListener("click", function(){
      const value = input.value.trim();
      if(!value){
        status.textContent = "请先输入临时 API Key。";
        status.style.color = "var(--danger)";
        return;
      }
      AI_CONFIG.apiKey = value;
      input.value = "";
      status.textContent = "已启用临时 Key。它只保存在当前页面内存中，刷新后会清空。";
      status.style.color = "var(--good)";
    });
  });
})();
