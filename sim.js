"use strict";

(function() {

    ////////// DISPLAY RELATED //////////
    var c = document.getElementById("c");
    var ctx = c.getContext("2d");

    function resizeCanvas() {
        c.width = window.innerWidth;
        c.height = window.innerHeight;
    }
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    ////////// OBJECT GENERATION //////////
    const N = 10 * 1000;
    const G = 300;
    const R = Math.min(c.width, c.height) * 0.5;
    const blackholeMass = N * 0.5; // The black hole at the center

    var objs = [];

    objs.push([c.width * 0.5, c.height * 0.5, 0, 0, blackholeMass])

    for (var i = 0; i < N; i++) {
	var angle = 2 * Math.PI * Math.random();
	var radius = R * Math.pow((Math.random() + 0.1) / 1.1, 2);
	var x = c.width * 0.5 + Math.cos(angle) * radius;
	var y = c.height * 0.5 + Math.sin(angle) * radius;
	var vOrbit = Math.sqrt(G * (N * (radius / R) + blackholeMass) / radius);
	var vx = Math.cos(angle + Math.PI / 2) * vOrbit;
	var vy = Math.sin(angle + Math.PI / 2) * vOrbit;

	objs.push([x, y, vx, vy, 1])
    }
    window.objs = objs;
    window.drawTree = true;

    ////////// O(N^2) Simulation //////////
    function simNaive(objs, deltaTime) {
	var newObjs = [];

	for (var i = 0; i < objs.length; i++) {
	    var fx = 0;
	    var fy = 0;
	    const [xi, yi, vxi, vyi, mi] = objs[i];

	    for (var k = 0; k < objs.length; k++) {
		if (i == k) continue;

		const [xk, yk, vxk, vyk, mk] = objs[k];

		var dx = xk - xi;
		var dy = yk - yi;
		var r2 = dx * dx + dy * dy;
		r2 += 1; // Prevent very close objects from "shooting" each other away.
		var r = Math.sqrt(r2);
		var f = G * mi * mk / r2;

		fx += dx / r * f;
		fy += dy / r * f;
	    }

	    var vx = vxi + fx / mi * deltaTime;
	    var vy = vyi + fy / mi * deltaTime;
	    var x = xi + vx * deltaTime;
	    var y = yi + vy * deltaTime;

	    newObjs.push([x, y, vx, vy, mi]);
	}

	return newObjs;
    }

    ////////// O(N * log(N)) Simulation //////////
    function barnesHutTree(objs, x, y, width, height) {
	if (objs.length == 0)
	    return null;

	var midx = x + width / 2;
	var midy = y + height / 2;

	// The tree root
	var T = {
	    objs: [],
	    // Center of mass
	    cx: 0, cy: 0, mass: 0,
	    // Quadrant location
	    x: x, y: y, width: width, height: height,
	    // Width 's' from the algorithm
	    s: objs.length == 1 ? 0 : Math.max(width, height),
	}

	// objs devided by quadrants
	var Q = [[], [], [], []];

	for (var o of objs) {
	    const [ox, oy, , , m] = o;
	    //console.assert(o.x >= x && o.y >= y && o.x <= x + width && o.y <= y + height);

	    var q = 0;
	    if (ox >= midx) q += 1;
	    if (oy >= midy) q += 2;
	    Q[q].push(o);

	    T.objs.push(o);
	    T.mass += m;
	    T.cx += ox * m;
	    T.cy += oy * m;
	}

	T.cx /= T.mass;
	T.cy /= T.mass;

	if (T.objs.length > 6) {
	    T.subtrees = [];
	    for (var i = 0; i < 4; i++) {
		if (Q[i].length == 0)
		    continue;
		T.subtrees.push(barnesHutTree(
		    Q[i],
		    x + width / 2 * (i % 2),
		    y + height / 2 * Math.floor(i / 2),
		    width / 2,
		    height / 2,
		));
	    }
	}

	return T;
    }

    function barnesHutDraw(tree) {
	if (tree === null)
	    return;

	ctx.strokeRect(tree.x, tree.y, tree.width, tree.height);

	if ('subtrees' in tree)
	    for (var t of tree.subtrees)
		barnesHutDraw(t);
    }

    function addForceNaive(x, y, m, objs, outForce) {
	for (var i = 0; i < objs.length; i++) {
	    const [xi, yi, , , mi] = objs[i];

	    var dx = xi - x;
	    var dy = yi - y;
	    var r2 = dx * dx + dy * dy;
	    r2 += 1; // Prevent very close objects from "shooting" each other away.
	    var r = Math.sqrt(r2);
	    var f = G * mi * m / r2;

	    outForce[0] += dx / r2 * f;
	    outForce[1] += dy / r2 * f;
	}
    }

    function barnesHutForce(x, y, m, tree, thetaSqr, outForce) {
	if (tree === null)
	    return;

	var dx = tree.cx - x;
	var dy = tree.cy - y;
	var d2 = dx * dx + dy * dy;
	if (d2 < 1e-5)
	    return; // Too close to calculate. Probably same object.
	d2 += 1; // Prevent very close objects from "shooting" each other away.

	if (tree.s * tree.s <= thetaSqr * d2) {
	    var d = Math.sqrt(d2);
	    // Far enough to approximate
	    var f = G * tree.mass * m / d2;
	    outForce[0] += dx / d * f;
	    outForce[1] += dy / d * f;
	}
	else if ('subtrees' in tree) {
	    // Subdivide into quadrants
	    for (var t of tree.subtrees) {
		barnesHutForce(x, y, m, t, thetaSqr, outForce);
	    }
	}
	else {
	    // Just go over the objects
	    addForceNaive(x, y, m, tree.objs, outForce);
	}
    }

    function simBarnesHut(objs, deltaTime, tree, thetaSqr) {
	var newObjs = [];

	for (var i = 0; i < objs.length; i++) {
	    var f = [0, 0];
	    const [xi, yi, vxi, vyi, mi] = objs[i];
	    barnesHutForce(xi, yi, mi, tree, thetaSqr, f);

	    var vx = vxi + f[0] / mi * deltaTime;
	    var vy = vyi + f[1] / mi * deltaTime;
	    var x = xi + vx * deltaTime;
	    var y = yi + vy * deltaTime;

	    newObjs.push([x, y, vx, vy, mi]);
	}

	return newObjs;
    }

    function update() {
        ctx.fillStyle = "#0A0A0C";
        ctx.fillRect(0, 0, c.width, c.height);

	console.time();
	ctx.fillStyle = "#ECE6DA";
	for (var o of objs) {
	    const [ox, oy, vx, vy, m] = o;
	    ctx.fillRect(ox - 2, oy - 2, 4, 4);
	    //ctx.beginPath();
	    //ctx.arc(ox, oy, 3, 0, 2 * Math.PI, false);
	    //ctx.closePath();
	    //ctx.fill();
	}

	// Remove objects that leave the screen
	objs = objs.filter(function(o) {
	    const [ox, oy, vx, vy, m] = o;
	    return ox >= 0 && oy >= 0 && ox <= c.width && oy <= c.height;
	});

	window.tree = barnesHutTree(objs, 0, 0, c.width, c.height);

	//objs = simNaive(objs, 0.016);
	objs = simBarnesHut(objs, 0.016, window.tree, 0.7 * 0.7);
	objs[0] = [c.width * 0.5, c.height * 0.5, 0, 0, blackholeMass]; // Fix blackhole to center
	console.timeEnd();

	window.objs = objs;

	if (window.drawTree) {
	    ctx.strokeStyle = "#60B99A";
	    barnesHutDraw(window.tree);
	}

	setTimeout(update, 16);
    }

    update();

    ////////// CLICKS //////////
    c.addEventListener("click", function() {
	window.drawTree = !window.drawTree;
    });
})();
