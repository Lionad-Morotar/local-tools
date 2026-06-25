---
name: edge
description: "通过 CDP (Chrome DevTools Protocol) 连接用户的 Edge 浏览器，利用现有的登录会话、Cookie 和保存的密码进行自动化操作。使用场景：(1) 用户希望在 Edge 中使用现有登录状态自动执行任务，(2) 网站需要登录/CAPTCHA 但用户已在 Edge 中解决，(3) 用户明确提到使用 Edge 浏览器，(4) 需要通过使用现有浏览器会话来绕过身份验证。"
argument-hint: <URL or browser task>
disable-model-invocation: true
---

## Important

* 禁止关闭现有 Edge 进程
* 应当使用 Edge，禁止使用 Chrome

## Workflow

1. 检查 Edge Chrome Devtools 端口是否正常运行

```bash
curl -s http://localhost:9333/json/version

# success response example
# {
#  "Browser": "Edg/145.0.3800.97",
#  "Protocol-Version": "1.3",
#  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0",
#  "V8-Version": "14.5.40.9",
#  "WebKit-Version": "537.36 (@f4c49d5241f148220b99eb7f045ac370a1694a15)",
#  "webSocketDebuggerUrl": "ws://localhost:9333/devtools/browser/d384a2e4-8bc0-4a1a-8f98-e7325d4ea55c"
# }
```

返回空或0，则表示 9333 没有运行。

如果返回结果显示 9333 端口正常运行，接下来直接使用 `chrome-devtools` 或 MCP 工具完成用户的需求，不必关心后续 prepare env 等步骤。

open a edge instance:

```bash
nohup /Applications/Microsoft\ Edge.app/Contents/MacOS/Microsoft\ Edge \
    --remote-allow-origins=http://localhost:9333 \
    --remote-debugging-port=9333
```

## 技术细节

### Origin 匹配

当通过 WebSocket 连接 CDP 时，**必须**设置与 Edge 启动参数 `--remote-allow-origins` 匹配的 Origin header，否则会收到 403 Forbidden 错误：

```
Handshake status 403 Forbidden -+-+- ...
Rejected an incoming WebSocket connection from the http://localhost:9333 origin.
```

**正确的连接方式：**
```python
import websockets

headers = {"Origin": "http://localhost:9333"}
ws_url = "ws://localhost:9333/devtools/page/<page-id>"

async with websockets.connect(ws_url, additional_headers=headers) as ws:
    # 连接成功
```

注意：Edge 启动时使用的是 `--remote-allow-origins=http://localhost:9333`，不是 `localhost`，所以 WebSocket 连接时也必须使用 `localhost` 作为 origin。

### CDP 消息队列处理

Chrome DevTools Protocol 是异步的，消息可能不会按发送顺序返回。需要正确处理消息队列：

```python
# 错误：假设响应按发送顺序返回
await ws.send(json.dumps({"id": 1, "method": "Page.enable"}))
await ws.send(json.dumps({"id": 2, "method": "Runtime.enable"}))
resp1 = await ws.recv()  # 可能是 id=2 的响应！
resp2 = await ws.recv()

# 正确：通过 id 匹配响应
await ws.send(json.dumps({"id": 1, "method": "Page.enable"}))
await ws.send(json.dumps({"id": 2, "method": "Runtime.enable"}))

responses = {}
for expected_id in [1, 2]:
    msg = json.loads(await ws.recv())
    if "id" in msg:
        responses[msg["id"]] = msg

# 处理特定 id 的响应
while True:
    msg = json.loads(await ws.recv())
    if msg.get("id") == 4:  # 等待 id=4 的响应
        result = msg
        break
```

常见的事件（非响应型）消息包括：
- `Page.loadEventFired` - 页面加载完成
- `Page.frameStoppedLoading` - 框架停止加载
- `Runtime.executionContextCreated` - 执行上下文创建

这些事件没有 `id` 字段，需要与带 `id` 的命令响应区分开来。
