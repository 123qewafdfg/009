#!/usr/bin/env sh
set -eu

ENV_ID="${1:-k12-sdfsf-5g757tm551b1d50b}"
CLOUD_PATH="${2:-/yinxie}"

echo "Deleting old CloudBase hosting files at ${CLOUD_PATH}..."
tcb hosting delete "${CLOUD_PATH}" --dir --force -e "${ENV_ID}" || true

echo "Uploading current static files to ${CLOUD_PATH}..."
tcb hosting deploy ./ "${CLOUD_PATH}" -e "${ENV_ID}"

echo "Done. Check that the response no longer contains: Content-Disposition: attachment"
