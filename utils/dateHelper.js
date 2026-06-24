const getLocalDate = (d = new Date()) => {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
};

module.exports = { getLocalDate };
