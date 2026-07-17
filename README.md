# Crossroads AI Decision Mirror

岔路牌是一个使用 DeepSeek API 的 AI 个人决策镜子，包含问题解析、22 张原创大阿卡纳、塔罗反思、多情景推演和本地决策记录。

## Deploy to Vercel

1. 将项目文件上传到 GitHub，但不要上传 `.env`、`.git` 或 `.agents`。
2. 在 Vercel 选择 **Add New → Project**，导入 GitHub 仓库。
3. 在 **Environment Variables** 添加：

   - `DEEPSEEK_API_KEY`：你的 DeepSeek API Key
   - `DEEPSEEK_BASE_URL`：`https://api.deepseek.com`
   - `DEEPSEEK_MODEL`：`deepseek-v4-flash`

4. 三个变量均勾选 Production、Preview 和 Development。
5. 点击 **Deploy**。

环境变量更新后，需要重新部署才能应用。

## Local development

在项目根目录创建 `.env`：

```env
DEEPSEEK_API_KEY=your_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
```

运行：

```bash
npm start
```

访问 `http://127.0.0.1:4173`。

