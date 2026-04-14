/**
 * jsSteg Javascript Library v1.0
 * https://github.com/owencm/js-steg
 * Copyright 2014, Owen Campbell-Moore and other contributors
 * Released under the MIT license
 *
 * Usage:
 * jsSteg provides two public functions, getCoefficients and reEncodeWithModifications.
 * Refer to their documentation below to understand their usage.
 *
 * Note:
 * This library depends on jsstegdecoder-1.0.js and jsstegencoder-1.0.js which have different
 * licences and must be included before this library.
 */
var jsSteg = (function() {
  var DEFAULT_JPEG_QUALITY = 75;
  var STANDARD_LUMA_TABLE = [
    16, 11, 10, 16, 24, 40, 51, 61,
    12, 12, 14, 19, 26, 58, 60, 55,
    14, 13, 16, 24, 40, 57, 69, 56,
    14, 17, 22, 29, 51, 87, 80, 62,
    18, 22, 37, 56, 68, 109, 103, 77,
    24, 35, 55, 64, 81, 104, 113, 92,
    49, 64, 78, 87, 103, 121, 120, 101,
    72, 92, 95, 98, 112, 100, 103, 99
  ];

  var estimateQualityFromQuantizationTable = function(table) {
    var bestQuality = DEFAULT_JPEG_QUALITY;
    var bestDiff = Number.POSITIVE_INFINITY;

    for (var quality = 1; quality <= 100; quality++) {
      var scaleFactor = quality < 50 ? Math.floor(5000 / quality) : Math.floor(200 - quality * 2);
      var diff = 0;

      for (var i = 0; i < 64; i++) {
        var expected = Math.floor((STANDARD_LUMA_TABLE[i] * scaleFactor + 50) / 100);
        if (expected < 1) expected = 1;
        if (expected > 255) expected = 255;
        diff += Math.abs(table[i] - expected);
      }

      if (diff < bestDiff) {
        bestDiff = diff;
        bestQuality = quality;
      }
    }

    return bestQuality;
  };

  var readOriginalJpegQuality = function(callback) {
    var originalCoverFile = window.originalCoverFile;

    if (!originalCoverFile || !/^image\/jpe?g$/i.test(originalCoverFile.type)) {
      callback(DEFAULT_JPEG_QUALITY);
      return;
    }

    var reader = new FileReader();
    reader.onload = function(event) {
      try {
        var bytes = new Uint8Array(event.target.result);
        var offset = 2;

        while (offset + 3 < bytes.length) {
          if (bytes[offset] !== 0xFF) {
            offset++;
            continue;
          }

          while (offset < bytes.length && bytes[offset] === 0xFF) {
            offset++;
          }

          if (offset >= bytes.length) {
            break;
          }

          var marker = bytes[offset++];
          if (marker === 0xD8 || marker === 0xD9 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
            continue;
          }

          if (offset + 1 >= bytes.length) {
            break;
          }

          var segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
          if (segmentLength < 2 || offset + segmentLength > bytes.length) {
            break;
          }

          if (marker === 0xDB) {
            var segmentEnd = offset + segmentLength;
            var pointer = offset + 2;

            while (pointer < segmentEnd) {
              var precisionAndId = bytes[pointer++];
              var precision = precisionAndId >> 4;
              var tableLength = precision === 0 ? 64 : 128;

              if (pointer + tableLength > segmentEnd) {
                break;
              }

              if ((precisionAndId & 0x0F) === 0 && precision === 0) {
                var table = [];
                for (var tableIndex = 0; tableIndex < 64; tableIndex++) {
                  table.push(bytes[pointer + tableIndex]);
                }
                callback(estimateQualityFromQuantizationTable(table));
                return;
              }

              pointer += tableLength;
            }
          }

          offset += segmentLength;
        }
      } catch (error) {
        console.warn("Failed to read original JPEG quality:", error);
      }

      callback(DEFAULT_JPEG_QUALITY);
    };
    reader.onerror = function() {
      callback(DEFAULT_JPEG_QUALITY);
    };
    reader.readAsArrayBuffer(originalCoverFile);
  };

  /**
   * Use the JPEG decoding library and pass on the coefficients to coeffReader
   * - url: the blob URL from which to read the image
   * - coeffReader: a function which will be called with the coefficients as an argument
   */
  var getCoefficients = function(url, coeffReader) {
    var image;
    image = new JpegImage();
    image.onload = function(coefficients) {
      return coeffReader(coefficients);
    };
    return image.load(url, true);
  };

  /**
   * Convert an image in any format to bmp data for encoding
   * - url: the blob URL to convert to bmp
   * - callback: called with the resulting data
   */
  var getImageDataFromURL = function(url, callback) {
    var img;
    img = document.createElement("img");
    img.onload = function() {
      var ctx, cvs;
      cvs = document.createElement("canvas");
      cvs.width = img.width;
      cvs.height = img.height;
      ctx = cvs.getContext("2d");
      ctx.drawImage(img, 0, 0);
      return callback(ctx.getImageData(0, 0, cvs.width, cvs.height));
    };
    return img.src = url;
  };

  /**
   * Decode the provided JPEG to raw data and then re-encode it with the JPEG encoding library,
   * running coefficientModifier on the coefficients while encoding
   * - url: the blob URL from which to 're-encode'
   * - coefficientModifier: this will be called with the coefficients as an argument which it can
   * modify before the encoding is completed
   */
  var reEncodeWithModifications = function(url, coefficientModifier, callback) {
    readOriginalJpegQuality(function(quality) {
      getImageDataFromURL(url, function(data) {
        var encoder = new JPEGEncoder();
        var jpegURI = encoder.encodeAndModifyCoefficients(data, quality, coefficientModifier);
        callback(jpegURI);
      });
    });
  };

  return {
    getCoefficients: getCoefficients,
    reEncodeWithModifications: reEncodeWithModifications
  };
})();
