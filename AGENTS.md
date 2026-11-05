# AGENTS.md

奶蛙宇宙贡献度看板：上传脚本拉取 nwverse 组织数据并计算贡献度，结果发布为 GitHub Pages 上的静态页面。用法见 [README.md](README.md)。

## 数据暴露范围

页面与 `data/board.json` 对任何人公开，发布记录永久留在 `gh-pages` 的 git 历史中。

- `[必须]` 只发布人维度的贡献度，以及不可拆分到仓库的组织级汇总（总合入数、每周活跃人数等）。
- `[禁止]` 发布仓库维度的信息：仓库名、仓库数量、按仓库拆分的统计，以及 PR、issue 的编号、标题、链接、正文、评论内容。
- `[禁止]` 发布组织成员名单。页面只出现有贡献记录的人，未参与的成员只以人数出现。
- `[必须]` 新增或修改 `data/board.json` 的字段前，确认不含上述信息，并在 PR 描述中列出改动的字段。
- `[必须]` 看板仓库本身列在 `RULES.excludeRepos` 中。理由：改看板的 PR 和数据提交不是对组织业务的贡献。

## 代码结构

- `engine.js`：规则（`RULES`）与计算，页面和上传脚本共用。只依赖输入数据、规则与时间。
- `scripts/upload.mjs`：拉取、计算、按上节范围裁剪字段，然后把 `SITE_FILES` 列出的页面、资源与数据一起发布。查询参数按 GitHub 计点规则调过，每批 1 点。
- 页面：`index.html`（本周）、`ranking.html`（排行榜）、`profile.html`（档案）、`hatchery.html`（孵化台）、`pond.html`（形态池）、`rules.html`（规则与口径）。只读取 `data/board.json` 展示。
- `assets/`：`boot.js` 读取数据后加载其余脚本并执行页面脚本；`derive.js` 展示用的派生指标（逐周累计、历史名次、预计升级），阈值读 `RULES`；`kit.js` 组件与交互；`tokens.css` 设计令牌与组件样式；`icons.js` 奶蛙形象。
- `scripts/serve.mjs`、`tests/e2e/`：本地预览与端到端测试，测试数据是脱敏快照 `tests/fixtures/board.json`。

- `[禁止]` 页面调用 GitHub API 或要求访问者提供 token。理由：数据由上传脚本统一生成，页面只做展示。
- `[禁止]` 在 `assets/derive.js` 或页面里另存计分阈值。理由：阈值只在 `RULES` 维护，页面与数据才能一致。
- `[必须]` 改动拉取层（批大小、并发、查询字段）后，用 `node scripts/upload.mjs --dry-run` 核对耗时、额度与结果。理由：嵌套连接数决定每批点数，多一个连接可能让额度翻倍。
- `[必须]` 修改 `RULES` 时，同步检查 `rules.html` 上手写的说明（「口径与盲区」「M-Team 规则对照」「名词解释」）。理由：这几处不由 `RULES` 自动生成。
- `[必须]` 新增页面或资源文件时，加入 `upload.mjs` 的 `SITE_FILES`。理由：发布只提交列出的文件，漏掉的文件线上会 404。
- `[必须]` 改动页面或 `assets/` 后运行 `npm run test:e2e`。理由：CI 用同一套用例检查六个页面的加载与主要交互。

## 分支与提交

- `main`：源码。`[必须]` 通过 PR 合入，只允许 squash，合并后源分支自动删除。
    - CI 的 `check` 与 `e2e` 通过后，有写权限的成员可以自助合并，不需要他人批准。
    - 改动 `.github/CODEOWNERS` 列出的路径时，需要任一管理员批准，理由写在该文件中。
    - 管理员可以用 `gh pr merge <编号> --squash --admin` 跳过批准与 CI，但仍然必须走 PR。
- `gh-pages`：发布分支。`[禁止]` 手动提交；只由上传脚本更新，只有仓库管理员可以推送。
- 两个分支都禁止删除和强制推送。
- `[必须]` PR 标题写清改动意图；squash 后它就是 `main` 上的提交说明。
