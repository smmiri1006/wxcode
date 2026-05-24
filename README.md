# wxcode

扫码协议 Web 管理页。

功能：

- 多协议扫码登录页面
- Web 提供统一的 `code/value` 接口给脚本调用
- 支持 iPad / Mac / Android / Windows / Win 统一版 / Win UWP / Car / 特殊通道
- 页面负责扫码登录，脚本负责轮询 Web 接口取值

启动：

```bash
npm install
npm start
```

默认地址：

```text
http://127.0.0.1:3218
```

主要接口：

- `POST /api/code/sessions`
- `GET /api/code/sessions/:id`
- `GET /api/code/sessions/:id/value`
- `GET /api/code/latest?protocolId=ipad`
