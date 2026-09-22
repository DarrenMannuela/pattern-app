// Real drafted pieces captured from the backend
// (POST /api/orders/{id}/preview), used so the geometry-helper tests
// exercise the shapes the app actually produces rather than hand-written
// stand-ins that might not match reality. If a drafting formula changes
// shape enough to break these, regenerate by hitting the preview endpoint
// for a temp order with the same options (collar/convertible/full sleeve;
// v_neck/contrast trim/three_quarter sleeve; polo collar) and re-saving the
// pieces keyed by name.

export const FIXTURES = {
  "collarShirt": {
    "Shirt front": {
      "name": "Shirt front",
      "pathData": "M0.0,8.6 C0.0,3.4 4.2,1.0 7.6,0.0 L20.1,1.5 C22.5,5.0 26.5,17.6 25.5,24.5 L25.5,71.0 C21.7,73.2 12.8,73.5 0.0,73.5 L0.0,8.6 Z",
      "width": 25.5,
      "height": 73.5
    },
    "Yoke": {
      "name": "Yoke",
      "pathData": "M0.0,2.3 C0.0,0.7 3.8,0.0 7.6,0.0 L20.6,1.0 C21.8,2.8 23.3,7.3 24.4,12.1 L0.0,12.1 L0.0,2.3 Z",
      "width": 20.6,
      "height": 9.8
    },
    "Shirt back": {
      "name": "Shirt back",
      "pathData": "M0.0,12.1 L24.4,12.1 C25.4,16.5 26.0,21.2 25.5,24.5 L27.0,71.0 C22.9,73.2 13.5,73.5 0.0,73.5 L0.0,12.1 Z",
      "width": 27,
      "height": 61.4
    },
    "Sleeve": {
      "name": "Sleeve",
      "pathData": "M17.3,0.0 C-2.2,0.0 13.7,12.8 0.0,12.8 L4.8,60.0 L29.8,60.0 L34.5,12.8 C20.4,12.8 36.5,0.0 17.3,0.0 Z",
      "width": 34.5,
      "height": 60
    },
    "Cuff": {
      "name": "Cuff",
      "pathData": "M0.0,0.0 L21.0,0.0 L21.0,8.0 L0.0,8.0 Z",
      "width": 21,
      "height": 8
    },
    "Cuff slit facing": {
      "name": "Cuff slit facing",
      "pathData": "M0.0,0.0 L2.0,0.0 L2.0,14.0 L0.0,14.0 Z",
      "width": 2,
      "height": 14
    },
    "Collar stand": {
      "name": "Collar stand",
      "pathData": "M0.0,2.5 L14.8,2.5 C17.9,2.5 20.3,1.2 21.2,0.0 L21.8,1.9 C19.2,4.2 17.5,5.4 14.8,5.4 L0.0,5.4 Z",
      "width": 21.8,
      "height": 5.4
    },
    "Collar leaf": {
      "name": "Collar leaf",
      "pathData": "M0.0,0.0 L21.8,0.0 L24.9,6.9 L21.3,6.0 C14.9,6.9 6.4,6.0 0.0,5.2 Z",
      "width": 24.9,
      "height": 6.9
    },
    "Placket": {
      "name": "Placket",
      "pathData": "M0.0,0.0 L3.5,0.0 L3.5,73.5 L0.0,73.5 Z",
      "width": 3.5,
      "height": 73.5
    }
  },
  "vneckShirt": {
    "Shirt front": {
      "name": "Shirt front",
      "pathData": "M0.0,20.8 L7.6,0.0 L20.1,1.5 C22.5,5.0 26.5,17.6 25.5,24.5 L25.5,71.0 C21.7,73.2 12.8,73.5 0.0,73.5 L0.0,20.8 Z",
      "width": 25.5,
      "height": 73.5
    },
    "Yoke": {
      "name": "Yoke",
      "pathData": "M0.0,2.3 C0.0,0.7 3.8,0.0 7.6,0.0 L20.6,1.0 C21.8,2.8 23.3,7.3 24.4,12.1 L0.0,12.1 L0.0,2.3 Z",
      "width": 20.6,
      "height": 9.8
    },
    "Shirt back": {
      "name": "Shirt back",
      "pathData": "M0.0,12.1 L24.4,12.1 C25.4,16.5 26.0,21.2 25.5,24.5 L27.0,71.0 C22.9,73.2 13.5,73.5 0.0,73.5 L0.0,12.1 Z",
      "width": 27,
      "height": 61.4
    },
    "Sleeve": {
      "name": "Sleeve",
      "pathData": "M17.3,0.0 C-2.2,0.0 13.7,12.8 0.0,12.8 L3.2,40.8 L31.3,40.8 L34.5,12.8 C20.4,12.8 36.5,0.0 17.3,0.0 Z",
      "width": 34.5,
      "height": 40.8
    },
    "Cuff": {
      "name": "Cuff",
      "pathData": "M0.0,0.0 L21.0,0.0 L21.0,8.0 L0.0,8.0 Z",
      "width": 21,
      "height": 8
    },
    "Cuff slit facing": {
      "name": "Cuff slit facing",
      "pathData": "M0.0,0.0 L2.0,0.0 L2.0,14.0 L0.0,14.0 Z",
      "width": 2,
      "height": 14
    },
    "Placket": {
      "name": "Placket",
      "pathData": "M0.0,0.0 L3.5,0.0 L3.5,52.7 L0.0,52.7 Z",
      "width": 3.5,
      "height": 52.7
    },
    "Neck trim": {
      "name": "Neck trim",
      "pathData": "M0.0,0.0 L64.5,0.0 L64.5,3.5 L0.0,3.5 Z",
      "width": 64.5,
      "height": 3.5
    }
  },
  "poloShirt": {
    "Shirt front": {
      "name": "Shirt front",
      "pathData": "M0.0,8.6 C0.0,3.4 4.2,1.0 7.6,0.0 L20.1,1.5 C22.5,5.0 26.5,17.6 25.5,24.5 L25.5,73.5 L0.0,73.5 L0.0,8.6 Z",
      "width": 25.5,
      "height": 73.5
    },
    "Shirt back": {
      "name": "Shirt back",
      "pathData": "M0.0,2.3 C0.0,0.7 3.8,0.0 7.6,0.0 L20.6,1.0 C22.6,4.5 26.3,17.5 25.5,24.5 L25.5,73.5 L0.0,73.5 L0.0,2.3 Z",
      "width": 25.5,
      "height": 73.5
    },
    "Sleeve": {
      "name": "Sleeve",
      "pathData": "M17.3,0.0 C-2.1,0.0 13.7,12.8 0.0,12.8 L4.8,60.0 L29.8,60.0 L34.5,12.8 C20.4,12.7 36.4,0.0 17.3,0.0 Z",
      "width": 34.5,
      "height": 60
    },
    "Polo collar": {
      "name": "Polo collar",
      "pathData": "M0.0,0.0 L43.1,0.0 L43.1,8.0 L0.0,8.0 Z",
      "width": 43.1,
      "height": 8
    },
    "Polo placket": {
      "name": "Polo placket",
      "pathData": "M0.0,0.0 L6.5,0.0 L6.5,18.0 L0.0,18.0 Z",
      "width": 6.5,
      "height": 18
    }
  }
};
