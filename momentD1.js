/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
const headers = {
	'Content-Type': 'application/json',
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type'
};
export default {
	async fetch(request, env, ctx) {

		const url = new URL(request.url);
		const path = url.pathname;
		const method = request.method;

		// 不建议这样写……建议用token分开校验……单纯为了省查询次数、偷懒，应该还有bug，熟人小范围使用，懒得修了……

		// 处理预检请求
		if (method === 'OPTIONS') {
			return new Response(null, {
				headers: headers,
			});
		}

		if (path === '/login' && method === 'POST') {
			const data = await request.json()
			const username = data.username;
			const password = data.password;
			if (username && password) {
				return await login(username, password, env) ? ok() : fail();
			}
			// return new Response('Login');
		}
		if (path === '/users' && method === 'GET') {
			return await users(env);
		}
		if (path === '/insertMoment' && method === 'POST') {
			const data = await request.json()
			const username = data.username;
			const password = data.password;
			const content = data.content;
			if ([...content].length > 512) return fail();
			const media = data.media;
			const address = data.address;
			if (username && password && content) {
				return await insertMoment(username, password, content, media, address, env)
			}
		}

		if (path === '/selectMoments' && method === 'GET') {
			const params = url.searchParams
			const page = params.get("page")
			const size = params.get("size")
			return page && size ? await selectMoments(size, page, env) : await selectMoments(undefined, undefined, env)
		}

		if (path === '/insertCommentByUser' && method === 'POST') {
			const data = await request.json()
			const username = data.username;
			const password = data.password;
			const content = data.content;
			if ([...content].length > 256) return fail();
			const rid = data.rid;
			const rusername = data.rusername;

			if (username && password && content && rid) {
				return await insertCommentByUser(username, password, content, rid, rusername, env)
			}
		}

		if (path === '/insertCommentByVisitor' && method === 'POST') {
			const data = await request.json()
			const username = data.username;
			const content = data.content;
			if ([...content].length > 128) return fail();
			const rid = data.rid;
			const rusername = data.rusername;

			if (username && content && rid) {
				return await insertCommentByVisitor(username, content, rid, rusername, env)
			}
		}

		if (path === '/selectComments' && method === 'GET') {
			const params = url.searchParams
			const page = params.get("page")
			const size = params.get("size")
			const rid = params.get("rid")
			if (rid)
				return page && size ? await selectComments(rid, size, page, env) : await selectComments(rid, undefined, undefined, env)
		}


		if (path === '/selectAllComments' && method === 'GET') {
			const params = url.searchParams
			const rid = params.get("rid")
			if (rid)
				return await selectAllComments(rid, env)
		}

		if (path === '/updateMoment' && method === 'POST') {
			const data = await request.json()
			const id = data.id;
			const username = data.username;
			const password = data.password;
			const content = data.content;
			if ([...content].length > 512) return fail();
			const media = data.media;
			const address = data.address;

			if (username && content && id && password) {
				return await updateMoment(id, content, media, address, username, password, env)
			}
		}

		if (path === '/deleteMoment' && method === 'POST') {
			const data = await request.json()
			const id = data.id;
			const username = data.username;
			const password = data.password;

			if (username && id && password) {
				return await deleteMoment(id, username, password, env)
			}
		}

		if (path === '/deleteCommentSelf' && method === 'POST') {
			const data = await request.json()
			const id = data.id;
			const username = data.username;
			if (id && username)
				return await deleteCommentSelf(id, username, env)
		}
		if (path === '/deleteCommentUser' && method === 'POST') {
			const data = await request.json()
			const id = data.id;
			const username = data.username;
			const password = data.password;
			const rid = data.rid;
			if (id && username && password && rid)
				return await deleteCommentUser(id, username, password, rid, env)
		}

		// return new Response('Hello World!');
		return fail("未知操作");
	},
};

function jsonResponse(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		// headers: {
		// 	"Content-Type": "application/json",
		// 	'Access-Control-Allow-Origin': '*'
		// },
		headers: headers
	});
}

function ok(data = {}, message = "Success") {
	let body;

	if (Array.isArray(data)) {
		// 如果是数组，包装为 data 字段
		body = { success: true, message, data };
	} else if (typeof data === 'object' && data !== null) {
		// 如果是对象，展开字段
		body = { success: true, message, ...data };
	} else {
		// 其他情况（数字、字符串、null 等），也包装为 data 字段
		body = { success: true, message, data };
	}

	return jsonResponse(body, 200);
}


function fail(message = "Failure", status = 400, extra = {}) {
	return jsonResponse({ success: false, message, ...extra }, status);
}

async function login(username, password, env) {
	const result = await env.DB
		.prepare(`SELECT EXISTS(SELECT 1 FROM user WHERE username = ? AND password = ?) AS valid;`)
		.bind(username, password)
		.first();

	return !!result?.valid;
}
async function users(env) {
	const result = await env.DB
		.prepare(`SELECT username FROM user;`)
		.all();

	return await selectRows(result);
}

function hasAffectedRows(result) {
	return result?.success === true && result?.meta?.changes > 0 ? ok() : fail();
}

async function selectRows(result) {
	// console.log(result.results)
	// return result?.success === true ? ok() : fail()
	if (result?.success) {
		var moments = result.results
		await Promise.all(
			moments.map(async moment => {
				moment.name = await getDisplayNameForEmail(moment.username);
				if (moment.rusername) {
					moment.rname = await getDisplayNameForEmail(moment.rusername);
				}
				moment.media = JSON.parse(moment.media)
			})
		);
		return ok(moments)
	}
	return fail()
}

async function insertMoment(username, password, content, media, address, env) {
	const result = await env.DB
		.prepare(`INSERT INTO moment (username,content,media,address,time,rid) 
SELECT ?,?,?,?,DATETIME('now'),NULL
WHERE EXISTS (
 SELECT 1 FROM user WHERE username = ? AND password = ?
);`)
		.bind(username, content, JSON.stringify(media) || null, address || null, username, password)
		.run();

	return hasAffectedRows(result);
}
async function selectMoments(size = 10, page = 1, env) {
	size = Math.max(1, parseInt(size));
	page = Math.max(1, parseInt(page));
	size = Math.min(size, 40); // 限制最多100条
	const offset = (page - 1) * size;
	const result = await env.DB.prepare(`
    SELECT * FROM moment WHERE rid IS NULL ORDER BY id DESC LIMIT ? OFFSET ?`).bind(size, offset).all();
	return await selectRows(result)
}
// 已有用户插入评论
async function insertCommentByUser(username, password, content, rid, rusername, env) {
	const result = await env.DB
		.prepare(`
			INSERT INTO moment (username,content,time,rid,rusername) 
SELECT ?,?,DATETIME('now'),?,? WHERE EXISTS (
 SELECT 1 FROM user WHERE username = ? AND password = ?) AND EXISTS (
      SELECT 1 FROM moment WHERE id = ?
    );
	`)
		.bind(username, content, rid, rusername || null, username, password, rid)
		.run();
	// console.log(result)
	return hasAffectedRows(result);
}
// 游客插入评论
async function insertCommentByVisitor(username, content, rid, rusername, env) {
	const result = await env.DB
		.prepare(`INSERT INTO moment (username, content, time, rid, rusername)
    SELECT ?, ?, DATETIME('now'), ? , ?
    WHERE NOT EXISTS (
      SELECT 1 FROM user WHERE username = ?
    ) AND EXISTS (
      SELECT 1 FROM moment WHERE id = ?
    );`)
		.bind(username, content, rid, rusername || null, username, rid)
		.run();
	return hasAffectedRows(result);
}
// 查询评论
async function selectComments(rid, size = 10, page = 1, env) {
	size = Math.max(1, parseInt(size));
	page = Math.max(1, parseInt(page));
	size = Math.min(size, 40); // 限制最多100条
	const offset = (page - 1) * size;
	const result = await env.DB.prepare(`
    SELECT * FROM moment WHERE rid = ? ORDER BY id DESC LIMIT ? OFFSET ?`).bind(rid, size, offset).all();
	return await selectRows(result)
}
// 查询所有评论
async function selectAllComments(rid, env) {
	// size = Math.max(1, parseInt(size));
	// page = Math.max(1, parseInt(page));
	// size = Math.min(size, 40); // 限制最多100条
	// const offset = (page - 1) * size;
	const result = await env.DB.prepare(`
    SELECT * FROM moment WHERE rid = ? ORDER BY id DESC`).bind(rid).all();
	return await selectRows(result)
}
// 更新时刻
async function updateMoment(id, content, media, address, username, password, env) {
	const result = await env.DB
		.prepare(`UPDATE moment
set content =  ? , media = ? ,address = ?
WHERE EXISTS (
 SELECT 1 FROM user WHERE username = ? AND password = ?
) AND id = ? AND username = ?`)
		.bind(content, JSON.stringify(media) || null, address || null, username, password, id,username)
		.run();
	return hasAffectedRows(result);
}

// -- 删除帖子
async function deleteMoment(id, username, password, env) {
	var result = await env.DB
		.prepare(`DELETE FROM moment WHERE username = ? AND id = ? AND 
EXISTS (
 SELECT 1 FROM user WHERE username = ? AND password = ?
);`)
		.bind(username, id, username, password)
		.run();
	if (result?.success === true && result?.meta?.changes > 0) {
		env.DB
			.prepare(`DELETE FROM moment WHERE rid = ?`).bind(id).run()
	}
	return hasAffectedRows(result);
}

// --- 删除评论自己
async function deleteCommentSelf(id, username, env) {
	const result = await env.DB
		.prepare(`DELETE FROM moment WHERE username = ? AND id = ? AND rid IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM user WHERE username = ? )`)
		.bind(username, id, username)
		.run();
	return hasAffectedRows(result);
}

// --- 删除评论User
// 
async function deleteCommentUser(id, username, password, rid, env) {
	const result = await env.DB
		.prepare(`DELETE FROM moment WHERE id = ? AND (username = ? OR EXISTS(SELECT 1 FROM moment WHERE username = ? AND id = ? )) AND 
EXISTS (
 SELECT 1 FROM user WHERE username = ? AND password = ?) `)
		.bind(id, username, username, rid,username,password)
		.run();
	return hasAffectedRows(result);
}

async function getDisplayNameForEmail(md5) {
	const url = `https://gravatar.com/${md5}.json`;
	// // 本地环境测试
	// return null;
	try {
		const response = await fetch(url);
		if (!response.ok) {
			return null; // 如果请求失败，返回 null
		}
		const obj = await response.json();
		const entry = obj.entry[0];
		return entry ? entry.displayName : null; // 返回 displayName 或 null
	} catch (error) {
		console.error('Fetch error:', error);
		return null; // 捕获错误时返回 null
	}
}