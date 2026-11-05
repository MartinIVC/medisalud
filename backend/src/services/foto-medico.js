const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

function imageMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  if (buffer.subarray(0, 8).equals(png)) {
    if (buffer.readUInt32BE(8) !== 13 || buffer.toString('ascii', 12, 16) !== 'IHDR') return null;
    let offset = 8;
    while (offset + 12 <= buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const end = offset + 12 + length;
      if (length > MAX_PHOTO_BYTES || end > buffer.length) return null;
      const type = buffer.toString('ascii', offset + 4, offset + 8);
      if (type === 'IEND') return length === 0 && end === buffer.length ? 'image/png' : null;
      offset = end;
    }
    return null;
  }
  if (
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff &&
    buffer[buffer.length - 2] === 0xff &&
    buffer[buffer.length - 1] === 0xd9
  )
    return 'image/jpeg';
  return null;
}

function photoUrl(id, updatedAt) {
  return updatedAt ? `/api/medicos/${id}/foto?v=${new Date(updatedAt).getTime()}` : null;
}

module.exports = { MAX_PHOTO_BYTES, imageMime, photoUrl };
