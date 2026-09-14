# ref/ —— 测试夹具说明

这里的 `*.html` 是**真实 V2EX 页面的抓取快照**，仅供离线测试与截图使用。

| 文件 | 对应路由 | 用途 |
|---|---|---|
| `home.html` | `/`（含右栏 TopicsHot） | 首页列表、版块 tab、今日热榜 |
| `recent.html` | `/recent` | 分页列表（`.ps_container`） |
| `node.html` | `/go/programming` | 节点页（行结构是 `.cell.from_uid.t_id`，与首页不同） |
| `topic.html` | `/t/1241734` | 主题页：正文、Supplement、19 层回复、标签、内嵌图片 |
| `bigtopic.html` | `/t/1241706` | 111 回复的多页主题，用来测分页（V2EX 每页 100 楼） |
| `member.html` | `/member/pwinner` | 会员页：资料卡、`.cell_tabs`、主题列表 |
| `planes.html` | `/planes` | 全部节点页：1367 个 `a.item_node`，分组用 `.header` + `.inner` |

## 为什么需要这些

V2EX 是服务端渲染的 MPA，没有列表 JSON 端点，脚本完全靠**解析页面 DOM** 工作。
所以「解析器对不对」只能在真实标记上验证 —— `npm test` 会把这些快照喂给 jsdom，
跑 785 条断言（含分页、会员页、空 DOM 兜底等分支）。

## 关于内容

这些快照包含当时公开页面上的**真实用户名、帖子标题与正文、头像 URL**。
它们都是 v2ex.com 上本来就公开可见的内容，放在这里只作为测试夹具，
不参与任何运行时逻辑（脚本在工作时解析的是用户自己浏览器里的页面，不读这些文件）。

如果这让你不舒服，可以：
- 删掉 `ref/*.html` 并跳过 `npm test`（脚本本身不依赖它们）；
- 或者用自己的抓取替换 —— 只要保留同样的 DOM 结构，断言就能过。

## 重新抓取

```bash
curl -sS "https://www.v2ex.com/"            -o ref/home.html
curl -sS "https://www.v2ex.com/recent"      -o ref/recent.html
curl -sS "https://www.v2ex.com/go/programming" -o ref/node.html
curl -sS "https://www.v2ex.com/t/1241734"   -o ref/topic.html
curl -sS "https://www.v2ex.com/t/1241706"   -o ref/bigtopic.html
curl -sS "https://www.v2ex.com/member/pwinner" -o ref/member.html
curl -sS "https://www.v2ex.com/planes"      -o ref/planes.html
```

> 注意：换新快照后，测试里少数硬编码的期望值（比如某个话题的回复数）可能需要跟着改。
