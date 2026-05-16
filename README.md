# PassLok Image Steganography

This is a pure static website. It can be deployed to Tencent CloudBase Static Website Hosting without a build step.

## Tencent CloudBase Fix

Your online URL was returning this response header:

```http
content-disposition: attachment
```

That header forces the browser to download `index.html` instead of opening the page. The site files should be uploaded as normal static website files, not as downloadable attachments.

Recommended redeploy command:

```powershell
npm i -g @cloudbase/cli
tcb login
.\deploy-tencent.ps1 -EnvId your-cloudbase-env-id
```

Or run the CloudBase CLI directly:

```powershell
tcb hosting delete /yinxie --dir --force -e your-cloudbase-env-id
tcb hosting deploy . /yinxie -e your-cloudbase-env-id
```

In a Linux CI/CD runner, use:

```bash
sh deploy-tencent.sh k12-sdfsf-5g757tm551b1d50b /yinxie
```

After redeploying, open:

```text
https://k12-sdfsf-5g757tm551b1d50b-1411243133.tcloudbaseapp.com/yinxie/
```

The response header for `index.html` must not include `content-disposition: attachment`.

## CloudBase Console Settings

In Tencent CloudBase Static Website Hosting:

- Set the default homepage document to `index.html`.
- Deploy this folder to `/yinxie`.
- If the old response is cached, purge/refresh the CDN cache after deployment.
- Do not use a download/share-file link as the website entry.
- If `index.html` still downloads, open Static Website Hosting file management, select `/yinxie/index.html`, and remove the object metadata/header `Content-Disposition: attachment` or change it to `inline`.

## Directory

- `index.html`: site entry
- `assets/css`: styles
- `assets/js`: scripts
- `assets/icons`: icons
- `sw.js`: service worker
- `site.webmanifest`: PWA manifest
