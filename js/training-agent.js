(function(){
  const $ = (id) => document.getElementById(id);
  const catLabel = { study:"学习", family:"家庭", life:"生活" };
  const maxInputLength = 3000;

  const trainingState = {
    scene: null,
    lastSceneTitle: "",
    messages: [],
    round: 0,
    maxRounds: 5,
    scoresHistory: [],
    finished: false,
    pendingUserReply: "",
    loading: false
  };

  const els = {};
  const scoreEls = {};

  function initTraining(){
    [
      "categorySelect","startTrainingBtn","changeSceneBtn","resetTrainingBtn","finishTrainingBtn",
      "sceneCategory","roundLabel","sceneTitle","sceneRole","sceneBackground","sceneGoal",
      "trainingChat","trainingInput","sendTrainingBtn","hintBtn","exampleBtn","retryTrainingBtn",
      "trainingError","trainingSummary","summaryActions","summaryRetryBtn","summaryChangeBtn","summaryHelpBtn",
      "fixyFeedback","lastRoundScores","totalScore"
    ].forEach((id)=>{ els[id] = $(id); });
    ["empathy","boundary","construct","deescalation"].forEach((key)=>{
      scoreEls[key] = { val: $(key + "Val"), bar: $(key + "Bar") };
    });
    els.startTrainingBtn.addEventListener("click", startTraining);
    els.changeSceneBtn.addEventListener("click", () => startTraining(true));
    els.resetTrainingBtn.addEventListener("click", () => trainingState.scene ? startWithScene(trainingState.scene) : startTraining());
    els.finishTrainingBtn.addEventListener("click", finishTrainingEarly);
    els.sendTrainingBtn.addEventListener("click", sendTrainingTurn);
    els.hintBtn.addEventListener("click", requestHint);
    els.exampleBtn.addEventListener("click", requestExample);
    els.retryTrainingBtn.addEventListener("click", retryTrainingTurn);
    els.summaryRetryBtn.addEventListener("click", () => trainingState.scene ? startWithScene(trainingState.scene) : startTraining());
    els.summaryChangeBtn.addEventListener("click", () => startTraining(true));
    els.summaryHelpBtn.addEventListener("click", () => document.getElementById("helpModeBtn").click());
    els.trainingInput.addEventListener("keydown", (event)=>{
      if(event.key === "Enter" && (event.metaKey || event.ctrlKey)) sendTrainingTurn();
    });
    renderEmptyChat();
    updateScores();
  }

  function sourceScenes(){
    return (window.SCENES || []).map(toTrainingScene);
  }

  function toTrainingScene(raw){
    const title = raw.title || "未命名场景";
    const category = raw.cat || "life";
    return {
      id: category + ":" + title,
      title,
      category,
      role: inferRole(title, raw.scene || ""),
      background: raw.scene || "这是一个常见的青少年社交场景。",
      opening: normalizeOpening(raw.quote) || inferOpening(title),
      goal: inferGoal(title, raw.choices || [])
    };
  }

  function normalizeOpening(quote){
    return String(quote || "").replace(/[「」]/g, "").trim();
  }

  function inferRole(title, background){
    const text = title + " " + background;
    if(/老师|课堂|成绩|作业被批/.test(text)) return "老师";
    if(/爸|妈|父母|家人/.test(text)) return "家人";
    if(/亲戚|姑|饭桌/.test(text)) return "亲戚";
    if(/组|汇报|小组/.test(text)) return "小组成员";
    if(/喜欢|心动|邀约|已读/.test(text)) return "喜欢的人";
    if(/陌生|咖啡馆|刚认识/.test(text)) return "刚认识的人";
    return "朋友/同学";
  }

  function inferOpening(title){
    if(/放鸽子/.test(title)) return "今天我有点懒，下次吧。";
    if(/抢功/.test(title)) return "这部分主要是我整理出来的。";
    if(/聊天记录|手机/.test(title)) return "没问题的话，为什么不能让我看？";
    return "你打算怎么回应？";
  }

  function inferGoal(title, choices){
    const good = choices.find((item)=>item.kind === "good");
    if(good && good.tip) return String(good.tip).replace(/<[^>]+>/g, "");
    if(/拒|不想|边界|隐私|外号|求助/.test(title)) return "表达自己的边界，同时尽量不把关系推向对立。";
    if(/误会|解释|成绩|答案/.test(title)) return "说明事实、保持语气稳定，并推动问题被澄清。";
    return "回应对方情绪，说清自己的立场，并提出一个具体下一步。";
  }

  function pickScene(forceChange){
    const selected = els.categorySelect.value;
    let pool = sourceScenes().filter((scene)=>selected === "all" || scene.category === selected);
    if(forceChange && pool.length > 1){
      pool = pool.filter((scene)=>scene.title !== trainingState.lastSceneTitle);
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function startTraining(forceChange){
    const scene = pickScene(!!forceChange);
    startWithScene(scene);
  }

  function startWithScene(scene){
    trainingState.scene = scene;
    trainingState.lastSceneTitle = scene.title;
    trainingState.messages = [{ speaker:"role", text: scene.opening }];
    trainingState.round = 0;
    trainingState.maxRounds = 3 + Math.floor(Math.random() * 3);
    trainingState.scoresHistory = [];
    trainingState.finished = false;
    trainingState.pendingUserReply = "";
    setError("");
    els.retryTrainingBtn.classList.add("hidden");
    els.trainingSummary.classList.remove("show");
    els.trainingSummary.textContent = "";
    els.summaryActions.classList.add("hidden");
    els.trainingInput.value = "";
    renderScene();
    renderChat();
    updateScores();
    setFixyText("先读一下背景和目标。第一句不用完美，重点是让对话还能继续。");
  }

  function renderScene(){
    const scene = trainingState.scene;
    if(!scene) return;
    els.sceneCategory.textContent = catLabel[scene.category] || "随机";
    els.sceneCategory.className = "tag " + scene.category;
    els.roundLabel.textContent = "第 " + Math.min(trainingState.round + 1, trainingState.maxRounds) + " / " + trainingState.maxRounds + " 轮";
    els.sceneTitle.textContent = scene.title;
    els.sceneRole.textContent = scene.role;
    els.sceneBackground.textContent = scene.background;
    els.sceneGoal.textContent = scene.goal;
  }

  function renderEmptyChat(){
    els.trainingChat.textContent = "";
    appendBubble(els.trainingChat, "fixy", "Fixy", "选择分类后点击“开始训练”。这里不会再出现 A/B/C/D 选择题。");
  }

  function renderChat(){
    els.trainingChat.textContent = "";
    for(const message of trainingState.messages){
      appendBubble(els.trainingChat, message.speaker, message.speaker === "user" ? "你" : (message.speaker === "fixy" ? "Fixy" : trainingState.scene.role), message.text);
    }
    els.trainingChat.scrollTop = els.trainingChat.scrollHeight;
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

  function recentMessages(){
    return trainingState.messages.slice(-12).map((item)=>({ speaker:item.speaker, text:item.text }));
  }

  function setLoading(isLoading, text){
    trainingState.loading = isLoading;
    els.sendTrainingBtn.disabled = isLoading;
    els.hintBtn.disabled = isLoading;
    els.exampleBtn.disabled = isLoading;
    els.startTrainingBtn.disabled = isLoading;
    els.changeSceneBtn.disabled = isLoading;
    if(isLoading) setFixyText(text || "Fixy正在进入角色……");
  }

  function setError(message){
    els.trainingError.textContent = message || "";
    els.trainingError.classList.toggle("show", !!message);
  }

  function clampScore(value){
    return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  }

  async function sendTrainingTurn(){
    if(trainingState.loading) return;
    if(!trainingState.scene) return setError("请先点击“开始训练”。");
    const userReply = els.trainingInput.value.trim();
    if(!userReply) return setError("先写一句你的回应。");
    if(userReply.length > maxInputLength) return setError("输入太长了，请控制在3000字以内。");
    trainingState.pendingUserReply = userReply;
    await runTrainingTurn(userReply);
  }

  async function retryTrainingTurn(){
    if(!trainingState.pendingUserReply) return;
    await runTrainingTurn(trainingState.pendingUserReply, true);
  }

  async function runTrainingTurn(userReply, retry){
    setError("");
    els.retryTrainingBtn.classList.add("hidden");
    setLoading(true, "Fixy正在分析这句话……");
    if(!retry){
      trainingState.messages.push({ speaker:"user", text:userReply });
      els.trainingInput.value = "";
      renderChat();
    }
    try{
      const result = await window.SocialFixAI.callAI({
        mode: "training",
        instructions: window.SocialFixAI.TRAINING_AGENT_PROMPT,
        payload: {
          scene: trainingState.scene,
          conversation: recentMessages(),
          user_reply: userReply,
          round: trainingState.round + 1,
          max_rounds: trainingState.maxRounds,
          request_type: "normal_turn"
        }
      });
      applyTrainingResult(result);
      trainingState.pendingUserReply = "";
    }catch(err){
      setError(err.message || "请求失败，请重试。");
      els.retryTrainingBtn.classList.remove("hidden");
      if(!els.trainingInput.value) els.trainingInput.value = userReply;
    }finally{
      setLoading(false);
    }
  }

  function applyTrainingResult(result){
    if(!result || result.type !== "training_turn") throw new Error("AI返回格式异常，请重试。");
    const scores = {
      empathy: clampScore(result.scores && result.scores.empathy),
      boundary: clampScore(result.scores && result.scores.boundary),
      constructiveness: clampScore(result.scores && result.scores.constructiveness),
      deescalation: clampScore(result.scores && result.scores.deescalation)
    };
    trainingState.scoresHistory.push(scores);
    trainingState.round += 1;
    if(result.role_reply){
      trainingState.messages.push({ speaker:"role", text: String(result.role_reply) });
    }
    const feedback = result.feedback || {};
    const fixyText = [
      feedback.good ? "做得好：" + feedback.good : "",
      feedback.improve ? "可以调整：" + feedback.improve : "",
      feedback.hint ? "下一步：" + feedback.hint : ""
    ].filter(Boolean).join("\\n");
    if(fixyText) trainingState.messages.push({ speaker:"fixy", text: fixyText });
    trainingState.finished = !!(result.state && result.state.finished) || trainingState.round >= trainingState.maxRounds;
    renderChat();
    renderScene();
    updateScores(scores);
    setFixyText(fixyText || "这一轮完成了。");
    if(trainingState.finished){
      showSummary(result.summary || "这次训练结束。你已经完成了完整多轮对话，可以换一个场景继续练。");
    }
  }

  function averageScores(){
    const count = trainingState.scoresHistory.length;
    if(!count) return { empathy:0, boundary:0, constructiveness:0, deescalation:0, total:null };
    const sum = trainingState.scoresHistory.reduce((acc, item)=>{
      acc.empathy += item.empathy;
      acc.boundary += item.boundary;
      acc.constructiveness += item.constructiveness;
      acc.deescalation += item.deescalation;
      return acc;
    }, { empathy:0, boundary:0, constructiveness:0, deescalation:0 });
    const avg = {
      empathy: Math.round(sum.empathy / count),
      boundary: Math.round(sum.boundary / count),
      constructiveness: Math.round(sum.constructiveness / count),
      deescalation: Math.round(sum.deescalation / count)
    };
    avg.total = Math.round((avg.empathy + avg.boundary + avg.constructiveness + avg.deescalation) / 4);
    return avg;
  }

  function updateScores(last){
    const avg = averageScores();
    setDim("empathy", avg.empathy);
    setDim("boundary", avg.boundary);
    setDim("construct", avg.constructiveness);
    setDim("deescalation", avg.deescalation);
    els.totalScore.textContent = avg.total === null ? "--" : String(avg.total);
    if(last){
      els.lastRoundScores.textContent = "共情 " + last.empathy + " / 边界 " + last.boundary + " / 建设 " + last.constructiveness + " / 降级 " + last.deescalation;
    }else{
      els.lastRoundScores.textContent = "还没有完成回合。";
    }
  }

  function setDim(key, value){
    scoreEls[key].val.textContent = String(value);
    scoreEls[key].bar.style.width = value + "%";
  }

  function setFixyText(text){
    els.fixyFeedback.textContent = text || "";
  }

  function showSummary(summary){
    const avg = averageScores();
    const entries = [
      ["共情度", avg.empathy],
      ["边界感", avg.boundary],
      ["建设性", avg.constructiveness],
      ["情绪降级", avg.deescalation]
    ];
    const strongest = entries.reduce((a,b)=>a[1] >= b[1] ? a : b);
    const weakest = entries.reduce((a,b)=>a[1] <= b[1] ? a : b);
    els.trainingSummary.textContent = "训练结束。平均分：" + (avg.total || 0) + "。最强项：" + strongest[0] + "。最值得练习：" + weakest[0] + "。\\n" + summary;
    els.trainingSummary.classList.add("show");
    els.summaryActions.classList.remove("hidden");
  }

  function finishTrainingEarly(){
    if(!trainingState.scene) return;
    trainingState.finished = true;
    showSummary("你手动结束了训练。可以换一个场景，或者切到“我要求助”处理真实问题。");
  }

  async function requestHint(){
    if(trainingState.loading) return;
    if(!trainingState.scene) return setError("请先开始一个场景。");
    setLoading(true, "Fixy正在整理提示……");
    setError("");
    try{
      const result = await window.SocialFixAI.callAI({
        mode: "training",
        instructions: window.SocialFixAI.TRAINING_AGENT_PROMPT,
        payload: {
          scene: trainingState.scene,
          conversation: recentMessages(),
          user_reply: "",
          round: trainingState.round + 1,
          max_rounds: trainingState.maxRounds,
          request_type: "hint_only"
        }
      });
      const hint = result.feedback && result.feedback.hint ? result.feedback.hint : "先回应对方为什么在意，再说你的边界。";
      trainingState.messages.push({ speaker:"fixy", text:"提示：" + hint });
      renderChat();
      setFixyText("提示：" + hint);
    }catch(err){
      setError(err.message || "提示生成失败。");
    }finally{
      setLoading(false);
    }
  }

  async function requestExample(){
    if(trainingState.loading) return;
    if(!trainingState.scene) return setError("请先开始一个场景。");
    setLoading(true, "Fixy正在写一条参考回复……");
    setError("");
    try{
      const result = await window.SocialFixAI.callAI({
        mode: "training",
        instructions: window.SocialFixAI.TRAINING_AGENT_PROMPT,
        payload: {
          scene: trainingState.scene,
          conversation: recentMessages(),
          user_reply: "",
          round: trainingState.round + 1,
          max_rounds: trainingState.maxRounds,
          request_type: "example_only"
        }
      });
      const example = result.role_reply || (result.feedback && result.feedback.hint) || "我知道你着急，但这件事我也需要一点时间，我们能不能先定一个具体安排？";
      const text = "示范一句：" + example + "\\n这只是参考，不是唯一正确答案。";
      trainingState.messages.push({ speaker:"fixy", text });
      renderChat();
      setFixyText(text);
    }catch(err){
      setError(err.message || "示范生成失败。");
    }finally{
      setLoading(false);
    }
  }

  window.trainingState = trainingState;
  document.addEventListener("DOMContentLoaded", initTraining);
})();
