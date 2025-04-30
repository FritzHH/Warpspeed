export function log(one, two) {
  let str = "";
  if (one) {
    str += one;
  }
  if (two) {
    str += "  :  ";
    str += two;
  } else {
    // str = "log: " + str;
  }
  console.log(one, two);
}

export function fetchIt(url) {
  log("fetching this url", url);
  return fetch(url).then((res) => {
    log("fetch url result", res);
    return res.json().then((json) => json);
  });
}

export const dim = {
  windowWidth: window.innerWidth,
  windowHeight: window.innerHeight,
};
