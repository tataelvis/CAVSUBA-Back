'use strict';

const app = require('./server');
const router = app.loopback.Router();
const crypto = require('crypto');
const fs = require('fs');
const pdfReader = require('pdfreader').PdfReader;
const pdfLib = require('pdf-lib');
const qr = require('qr-image');

const HOST = 'http://127.0.0.1:3000';
const HOST_FRONT = 'http://127.0.0.1:8080';

router.get('/sign', ({query: {filename}}, res) => {
  let comContent = '';
  fs.readFile(`fichiers/communique/${filename}`, (err, pdfBuffer) => {
    new pdfReader().parseBuffer(pdfBuffer, (err, doc) => {
      if (doc && !doc.text) {
        console.log('Take note here ====>', doc);
      } else if (doc && doc.text) {
        comContent = `${comContent}${doc.text}`;
      } else if (!doc) {
        const privateKey = fs.readFileSync('certs/private.pem', 'utf-8');
        const signer = crypto.createSign('sha256');
        signer.update(comContent);
        signer.end();
        const signature = signer.sign(privateKey);
        const signatureHex = `${signature.toString('hex')} ${filename}`;
        // fs.writeFileSync('signature.txt', signature);
        const qrPng = qr.image(signatureHex, {type: 'png'});
        qrPng.pipe(fs.createWriteStream(
          `fichiers/qr-codes/${filename}.qcode.png`
        ));
        // const qrImage = fs.readFileSync(`fichiers/qr-codes/${filename}.qcode.png`);
        fs.readFile(`fichiers/qr-codes/${filename}.qcode.png`, (err, qrImage) => {
          const pdfCom = fs.readFileSync(`fichiers/communique/${filename}`);
          pdfLib.PDFDocument.load(pdfCom).then(newPdfDoc => {
            const pages = newPdfDoc.getPages();
            const firstPage = pages[0];
            newPdfDoc.embedPng(qrImage).then(pngImage => {
              const pngDims = pngImage.scale(0.2);
              firstPage.drawImage(pngImage, {
                x: firstPage.getWidth() / 2 + 115,
                y: firstPage.getHeight() - 230,
                width: pngDims.width,
                height: pngDims.height,
              });
              newPdfDoc.save().then(pdfBytes => {
                fs.writeFile(`fichiers/qr-codes/${filename}.sign.pdf`, pdfBytes, (err, done) => {
                  res.redirect(`${HOST}/api/containers/qr-codes/download/${filename}.sign.pdf`);
                });
              });
            }).catch(console.log);
          }).catch(console.log);
        });
      }
    });
  });
});

router.post('/verify', ({body: {data}}, res) => {
  let comContent = '';
  const dataContent = data.split(' ');
  const signature = Buffer.from(dataContent[0], 'hex');
  const filename = dataContent[1];

  fs.readFile(`fichiers/communique/${filename}`, (err, pdfBuffer)=> {
    if (err) {
      res.status(404).json({message: 'Unknown communique'});
    } else {
      new pdfReader().parseBuffer(pdfBuffer, (err, doc) => {
        if (doc && doc.text) {
          comContent = `${comContent}${doc.text}`;
        } else if (!doc) {
          const publicKey = fs.readFileSync('certs/public.pem', 'utf-8');
          const verifier = crypto.createVerify('sha256');
          verifier.update(comContent);
          verifier.end();
          const verified = verifier.verify(publicKey, signature);
          res.json({result: verified});
        }
      });
    }
  });
});

module.exports = router;
