# Client Delivery Checklist

## APK readiness

- [ ] GitHub Actions build is green.
- [ ] APK is a release build, not a debug build.
- [ ] Android target SDK is 34.
- [ ] App version and version code are correct.
- [ ] APK was installed and opened on real devices.

## AI readiness

- [ ] Customer product labels are final.
- [ ] Customer-trained ONNX model is installed.
- [ ] Confidence threshold is tested under warehouse lighting.
- [ ] False positives and false negatives are documented.
- [ ] Counting accuracy report is attached.

## Backend readiness

- [ ] `DATABASE_URL` points to production PostgreSQL.
- [ ] `API_KEY` is at least 32 random characters.
- [ ] HTTPS is enabled.
- [ ] Backups are configured.
- [ ] Rate limits are acceptable for expected device count.

## Security and privacy

- [ ] No secrets committed to GitHub.
- [ ] Android permissions reviewed.
- [ ] Privacy policy prepared if camera data or uploads are used.
- [ ] Customer data retention policy agreed.

## Handover

- [ ] Admin guide delivered.
- [ ] User guide delivered.
- [ ] Support contact and SLA agreed.
- [ ] Known limitations signed off by customer.
