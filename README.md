# 업무 종합 html 대시보드

GitHub 푸시용 파일 세트입니다.

## 포함 파일
- `admin_dashboard.html` : 제목을 **업무 종합 html 대시보드** 로 수정한 메인 HTML
- `README.md` : 프로젝트 안내
- `sample_corporate_card_data.csv` : 카드 분석 테스트용 샘플 데이터
- `.gitignore` : 불필요 파일 제외 설정
- `push_to_github.sh` : GitHub 최초 업로드/갱신용 스크립트

## 사용 방법
1. `admin_dashboard.html` 파일을 브라우저에서 열어 확인합니다.
2. 필요 시 내용을 수정합니다.
3. 아래 스크립트로 GitHub 저장소에 푸시합니다.

```bash
chmod +x push_to_github.sh
./push_to_github.sh
```

## 참고
- 이 HTML은 로컬에서 바로 실행 가능한 단일 파일입니다.
- 일부 데이터는 브라우저 `localStorage`를 사용할 수 있습니다.
