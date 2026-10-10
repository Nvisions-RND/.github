# .github

조직 프로필(https://github.com/Nvisions-RND 첫 화면)을 그리는 저장소.

- `profile/README.md` — 조직 첫 화면에 보이는 글. 배너 `profile/banner.png`.
- `scripts/build-stats.mjs` — 저장소별(이름순) 최근 1년 커밋 현황·잔디·조직 전체 3D 잔디를 만들어 README 의 `<!-- stats:start --> … <!-- stats:end -->` 구역에 적는다.
- `.github/workflows/stats.yml` — 매일 03:00 KST 에 위 스크립트를 돌려 커밋한다. 비공개 저장소까지 세려면 저장소 비밀 **`ORG_TOKEN`**(조직 저장소 읽기 권한의 PAT)이 필요하다.

손으로 돌리기:

```bash
ORG_TOKEN=$(gh auth token) node scripts/build-stats.mjs
```
