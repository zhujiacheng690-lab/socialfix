(function(){
  const $ = (id) => document.getElementById(id);
  const helpState = {
    messages: [],
    loading: false,
    pendingPayload: null
  };

  const els = {};

  function init(){
    [
      "trainingModeBtn","helpModeBtn","trainingPanel","helpPanel","helpSituation","relationshipSelect",
      "goalSelect","toneSelect","askHelpBtn","sampleHelpBtn","clearHelpBtn","retryHelpBtn",
      "helpError","helpResult","helpChat","helpFollowInput","sendFollowBtn"
    ].forEach((id)=>{ els[id] = $(id); });
    document.querySelectorAll(".mode-btn").forEach((button)=>{
      button.addEventListener("click", ()=>switchMode(button.dataset.mode));
    });
    els.askHelpBtn.addEventListener("click", askHelp);
    els.sampleHelpBtn.addEventListener("click", fillSample);
    els.clearHelpBtn.addEventListener("click", clearHelp);
    els.retryHelpBtn.addEventListener("click", retryHelp);
    els.sendFollowBtn.addEventListener("click", sendFollowUp);
    const initialMode = new URLSearchParams(window.location.search).get("mode");
    if(initialMode === "help") switchMode("help");
    renderHelpChat();
  }

  function switchMode(mode){
    const isHelp = mode === "help";
    els.trainingModeBtn.classList.toggle("active", !isHelp);
    els.helpModeBtn.classList.toggle("active", isHelp);
    els.trainingPanel.classList.toggle("active", !isHelp);
    els.helpPanel.classList.toggle("active", isHelp);
  }

  function setLoading(isLoading, text){
    helpState.loading = isLoading;
    els.askHelpBtn.disabled = isLoading;
    els.sampleHelpBtn.disabled = isLoading;
    els.clearHelpBtn.disabled = isLoading;
    els.sendFollowBtn.disabled = isLoading;
    if(isLoading) setError("");
    if(isLoading && text) addHelpMessage("fixy", text);
  }

  function setError(message){
    els.helpError.textContent = message || "";
    els.helpError.classList.toggle("show", !!message);
  }

  function fillSample(){
    els.helpSituation.value = "我和朋友约好周末出去，但他临时放我鸽子，晚上又在朋友圈发了和别人出去玩的照片。我有点生气，但又不想直接吵起来。";
    els.relationshipSelect.value = "朋友";
    els.goalSelect.value = "表达不满";
    els.toneSelect.value = "自然";
  }

  function clearHelp(){
    helpState.messages = [];
    helpState.pendingPayload = null;
    els.helpSituation.value = "";
    els.helpFollowInput.value = "";
    els.retryHelpBtn.classList.add("hidden");
    setError("");
    renderHelpChat();
    renderEmptyResult();
  }

  function renderEmptyResult(){
    els.helpResult.textContent = "";
    const card = document.createElement("div");
    card.className = "result-card";
    card.textContent = "结果会显示在这里。";
    els.helpResult.appendChild(card);
  }

  function buildPayload(extraQuestion){
    return {
      relationship: els.relationshipSelect.value,
      goal: els.goalSelect.value,
      tone: els.toneSelect.value,
      situation: els.helpSituation.value.trim(),
      conversation: helpState.messages.slice(-10),
      follow_up: extraQuestion || ""
    };
  }

  async function askHelp(){
    if(helpState.loading) return;
    const situation = els.helpSituation.value.trim();
    if(!situation) return setError("先描述一下发生了什么。");
    if(situation.length > 3000) return setError("描述太长了，请控制在3000字以内。");
    const payload = buildPayload("");
    helpState.pendingPayload = payload;
    helpState.messages.push({ speaker:"user", text:situation });
    renderHelpChat();
    await runHelp(payload);
  }

  async function sendFollowUp(){
    if(helpState.loading) return;
    const question = els.helpFollowInput.value.trim();
    if(!question) return setError("先写一句你想继续问的问题。");
    if(question.length > 1200) return setError("追问太长了，请简短一点。");
    const payload = buildPayload(question);
    helpState.pendingPayload = payload;
    helpState.messages.push({ speaker:"user", text:question });
    els.helpFollowInput.value = "";
    renderHelpChat();
    await runHelp(payload);
  }

  async function retryHelp(){
    if(helpState.pendingPayload) await runHelp(helpState.pendingPayload);
  }

  async function runHelp(payload){
    setLoading(true, "Fixy正在整理建议……");
    els.retryHelpBtn.classList.add("hidden");
    try{
      const result = await window.SocialFixAI.callAI({
        mode: "help",
        instructions: window.SocialFixAI.HELP_AGENT_PROMPT,
        payload
      });
      if(!result || result.type !== "help") throw new Error("AI返回格式异常，请重试。");
      renderHelpResult(result);
      helpState.messages.push({ speaker:"fixy", text:result.situation_summary || "我整理好建议了。" });
      renderHelpChat();
      helpState.pendingPayload = null;
    }catch(err){
      setError(err.message || "请求失败，请重试。");
      els.retryHelpBtn.classList.remove("hidden");
    }finally{
      setLoading(false);
    }
  }

  function addHelpMessage(kind, text){
    helpState.messages.push({ speaker:kind, text });
    renderHelpChat();
  }

  function renderHelpChat(){
    els.helpChat.textContent = "";
    if(!helpState.messages.length){
      appendBubble(els.helpChat, "fixy", "Fixy", "把真实情况写下来，我会帮你拆成事实、风险、步骤和可参考回复。");
      return;
    }
    for(const message of helpState.messages.slice(-12)){
      appendBubble(els.helpChat, message.speaker === "user" ? "user" : "fixy", message.speaker === "user" ? "你" : "Fixy", message.text);
    }
    els.helpChat.scrollTop = els.helpChat.scrollHeight;
  }

  function appendBubble(container, kind, speaker, text){
    const bubble = document.createElement("div");
    bubble.className = "bubble " + kind;
    const label = document.createElement("span");
    label.className = "speaker";
    label.textContent = speaker;
    const body = document.createElement("span");
    body.textContent = text;
    bubble.appendChild(label);
    bubble.appendChild(body);
    container.appendChild(bubble);
  }

  function renderHelpResult(result){
    els.helpResult.textContent = "";
    addCard("情况判断", result.situation_summary);
    addCard("对方可能在意", result.possible_other_need);
    addCard("你真正想表达", result.user_need);
    addCard("最大风险", result.main_risk);
    addListCard("推荐步骤", result.steps || []);
    addReplies(result.replies || {});
    addListCard("不建议发送", result.avoid || []);
    if(result.follow_up_question) addCard("可以继续想一想", result.follow_up_question);
    if(result.risk_level === "high" || result.safety_message){
      addCard("安全提示", result.safety_message || "这个情况不适合只靠话术处理。请保存证据，联系可信任成年人、学校工作人员或当地紧急服务。", "danger");
    }
  }

  function addCard(title, text, tone){
    const card = document.createElement("div");
    card.className = "result-card" + (tone === "danger" ? " danger" : "");
    const h = document.createElement("h4");
    h.textContent = title;
    const p = document.createElement("p");
    p.textContent = text || "-";
    card.appendChild(h);
    card.appendChild(p);
    els.helpResult.appendChild(card);
  }

  function addListCard(title, items){
    const card = document.createElement("div");
    card.className = "result-card";
    const h = document.createElement("h4");
    h.textContent = title;
    const ul = document.createElement("ul");
    (items.length ? items : ["-"]).forEach((item)=>{
      const li = document.createElement("li");
      li.textContent = item;
      ul.appendChild(li);
    });
    card.appendChild(h);
    card.appendChild(ul);
    els.helpResult.appendChild(card);
  }

  function addReplies(replies){
    const card = document.createElement("div");
    card.className = "result-card";
    const h = document.createElement("h4");
    h.textContent = "三种参考回复";
    card.appendChild(h);
    const map = [
      ["自然版", replies.natural],
      ["温和版", replies.gentle],
      ["坚定版", replies.firm]
    ];
    const wrap = document.createElement("div");
    wrap.className = "reply-grid";
    map.forEach(([label, text])=>{
      const row = document.createElement("div");
      row.className = "copy-row";
      const p = document.createElement("p");
      p.className = "copy-text";
      p.textContent = label + "：" + (text || "-");
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.type = "button";
      btn.textContent = "复制";
      btn.addEventListener("click", ()=>navigator.clipboard && navigator.clipboard.writeText(text || ""));
      row.appendChild(p);
      row.appendChild(btn);
      wrap.appendChild(row);
    });
    card.appendChild(wrap);
    els.helpResult.appendChild(card);
  }

  window.helpState = helpState;
  document.addEventListener("DOMContentLoaded", init);
})();
