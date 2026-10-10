# 2T2F Book

한 사이클에 두 블록: 2-taken과 2-fetch 교과서. XiangShan Kunminghu V3 frontend의 2-taken / 2-fetch 구현을
장 단위로 설명하는 정적 웹 책이다. 각 장은 학습 목표, 질문형 소제목, 손으로 돌려 보는 실험, 핵심 정리, 확인 퀴즈로 이루어진다.

- 본문 소스: `src/book.md` (단일 Markdown)
- 빌드: `python build.py` → `index.html`, `chapters/chN.html`
- 실험 위젯: `assets/book.js` (설명용 축소 모델, RTL 측정값이 아님)
- 그림: `figures/` (`gen_2t2f_figures.py`로 생성한 PNG)

기준 코드는 `feat/p3_2taken_backend_targetmem` 브랜치다. 같은 내용의 발표용 문서는 XiangShan 저장소의 `docs/2T2F_INTRO_KR.md`에 있다.

빌드 의존성: Python 3, `pip install markdown`.
