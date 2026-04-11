/**
 * i18n — Internationalization for XieXie.
 * Supports English (en) and Chinese (zh) UI languages.
 * Language preference stored in localStorage.
 */

const PREFIX = 'xxg_';

const strings = {
  // ─── Profile Picker ───
  'app.title': { en: 'XieXie', zh: '写写' },
  'app.subtitle': { en: "Who's practicing today?", zh: '今天谁来练习？' },
  'app.addChild': { en: '+ Add child', zh: '+ 添加孩子' },
  'app.words': { en: 'words', zh: '字' },
  'app.wordsLearned': { en: 'words learned', zh: '字已学' },
  'app.mastered': { en: 'mastered', zh: '掌握' },
  'app.practice': { en: 'Practice', zh: '练习' },
  'app.test': { en: 'Test', zh: '测试' },
  'app.editWords': { en: 'Words', zh: '字表' },
  'app.footer.warning': { en: 'Still in testing mode — features may change.', zh: '仍在测试中，功能可能会更改。' },
  'app.footer.madeBy': { en: 'Made by Xin.', zh: 'Xin 制作。' },
  'app.footer.tipBoba': { en: 'Tip me a boba 🧋', zh: '请我喝奶茶 🧋' },
  'app.footer.feedback': { en: 'Give feedback ✉️', zh: '意见反馈 ✉️' },

  // ─── Empty state (no profiles) ───
  'empty.title': { en: 'Welcome to XieXie!', zh: '欢迎来到写写！' },
  'empty.desc': { en: 'A handy app to help kids ace their\u00A0听写\u00A0test.', zh: '帮助孩子听写拿满分的好帮手。' },
  'empty.warning': { en: 'Still in testing mode. Some features may change.', zh: '仍在测试中，部分功能可能会更改。' },
  'empty.start': { en: "Let's go!", zh: '开始吧！' },

  // ─── Onboarding ───
  'onboarding.howItWorks': { en: 'How it works', zh: '使用方法' },
  'onboarding.step1.title': { en: 'Pick your word lists', zh: '选择生字表' },
  'onboarding.step1.desc': { en: 'Import from YCT, Si Wu Kuai Du, or create your own lists', zh: '从 YCT、《四五快读》导入，或自己创建' },
  'onboarding.step2.title': { en: 'Build strong habits', zh: '养成好习惯' },
  'onboarding.step2.desc': { en: '5-minute sessions with listening, reading, matching, and writing', zh: '每天5分钟：听、读、配对、写字' },
  'onboarding.step3.title': { en: 'Practice smarter, not harder', zh: '练得巧，不练多' },
  'onboarding.step3.desc': { en: 'Tough characters get extra practice. Easy ones review less often.', zh: '难的字多练，会的字少练。' },
  'onboarding.step4.title': { en: 'Ready for dictation day', zh: '听写考满分' },
  'onboarding.step4.desc': { en: 'From guided tracing to freehand writing — builds real 听写 skills', zh: '从描红到默写 — 真正掌握听写' },
  'onboarding.letsGo': { en: "Let's go!", zh: '开始吧！' },

  // ─── Create Profile ───
  'profile.create': { en: 'Create a profile', zh: '创建档案' },
  'profile.name': { en: 'Name', zh: '名字' },
  'profile.namePlaceholder': { en: "Your child's name", zh: '孩子的名字' },
  'profile.pickAvatar': { en: 'Pick an avatar', zh: '选择头像' },
  'profile.age': { en: 'Age', zh: '年龄' },
  'profile.back': { en: 'Back', zh: '返回' },
  'profile.next': { en: 'Next', zh: '下一步' },

  // ─── Pick Pack ───
  'pack.pickTitle': { en: 'Pick word packs', zh: '选择字卡包' },
  'pack.pickDesc': { en: (name) => `Choose one or more packs for ${name}. You can always add more later.`, zh: (name) => `为${name}选择一个或多个字卡包。以后还可以添加更多。` },
  'pack.letsStart': { en: "Let's Start!", zh: '开始学习！' },
  'pack.settingUp': { en: 'Setting up...', zh: '准备中...' },
  'pack.errorRetry': { en: 'Error — tap to retry', zh: '出错了 — 点击重试' },

  // ─── Word Editor ───
  'words.title': { en: (name) => `${name}'s Words`, zh: (name) => `${name}的生字` },
  'words.deleteProfile': { en: 'Delete Profile', zh: '删除档案' },
  'words.noWords': { en: 'No words yet', zh: '还没有生字' },
  'words.noWordsDesc': { en: 'Add a word pack to get started.', zh: '添加一个字卡包开始吧。' },
  'words.addPack': { en: '+ Add Pack', zh: '+ 添加字卡包' },
  'words.customWords': { en: 'Custom Words', zh: '自定义生字' },
  'words.mastered': { en: 'mastered', zh: '已掌握' },
  'words.paused': { en: 'Paused', zh: '已暂停' },
  'words.words': { en: 'words', zh: '个字' },

  // ─── Add Pack catalog ───
  'addPack.title': { en: 'Add a Pack', zh: '添加字卡包' },
  'addPack.createOwn': { en: 'Create Your Own', zh: '自己创建' },
  'addPack.createOwnDesc': { en: 'Type or paste Chinese characters.', zh: '输入或粘贴汉字。' },
  'addPack.photoImport': { en: 'Import from Photo', zh: '从照片导入' },
  'addPack.photoImportDesc': { en: 'Scan homework or flashcards with camera.', zh: '用相机扫描作业或字卡。' },
  'addPack.add': { en: '+ Add', zh: '+ 添加' },
  'addPack.added': { en: '✓ Added', zh: '✓ 已添加' },

  // ─── Create Custom Pack ───
  'custom.createTitle': { en: 'Create a Pack', zh: '创建字卡包' },
  'custom.packName': { en: 'Pack Name', zh: '名称' },
  'custom.packNamePlaceholder': { en: "e.g. This week's homework", zh: '例如：这周的作业' },
  'custom.descLabel': { en: 'Description (optional)', zh: '描述（可选）' },
  'custom.descPlaceholder': { en: 'e.g. Lesson 5 words', zh: '例如：第5课生字' },
  'custom.learnInOrder': { en: 'Learn in order', zh: '按顺序学习' },
  'custom.learnInOrderHint': { en: 'Words will be introduced sequentially, not randomly.', zh: '生字将按顺序出现，而不是随机。' },
  'custom.cancel': { en: 'Cancel', zh: '取消' },
  'custom.next': { en: 'Next', zh: '下一步' },

  // ─── Add Words textarea ───
  'addWords.hint': { en: 'Type or paste Chinese characters. Put each word on its own line, or separate with commas or semicolons. Compounds are auto-detected.', zh: '输入或粘贴汉字。每行一个词，或用逗号、分号分隔。自动识别词组。' },
  'addWords.lookingUp': { en: 'Looking up...', zh: '查询中...' },

  // ─── Confirm Words ───
  'confirm.title': { en: 'Confirm Words', zh: '确认生字' },
  'confirm.noNew': { en: 'No new words found.', zh: '没有找到新的生字。' },
  'confirm.alreadyIn': { en: 'Already in list:', zh: '已在列表中：' },
  'confirm.addN': { en: (n) => `Add ${n} word${n !== 1 ? 's' : ''}`, zh: (n) => `添加 ${n} 个字` },
  'confirm.adding': { en: 'Adding...', zh: '添加中...' },
  'confirm.pinyin': { en: 'pinyin', zh: '拼音' },
  'confirm.meaning': { en: 'meaning', zh: '意思' },

  // ─── Photo Import ───
  'photo.title': { en: 'Import from Photo', zh: '从照片导入' },
  'photo.tap': { en: 'Tap to take a photo or choose from gallery', zh: '点击拍照或从相册选择' },
  'photo.selected': { en: (n) => `${n} photo${n !== 1 ? 's' : ''} selected`, zh: (n) => `已选择 ${n} 张照片` },
  'photo.scan': { en: 'Scan for characters', zh: '扫描汉字' },
  'photo.scanning': { en: 'Scanning...', zh: '扫描中...' },
  'photo.scanningN': { en: (i, t, p) => `Scanning photo ${i} of ${t}... ${p}%`, zh: (i, t, p) => `正在扫描第 ${i}/${t} 张... ${p}%` },
  'photo.lookingUp': { en: 'Looking up characters...', zh: '正在查询汉字...' },
  'photo.noChars': { en: 'No Chinese characters found. Try a clearer photo.', zh: '未找到汉字。请尝试更清晰的照片。' },
  'photo.error': { en: 'Error processing photos. Please try again.', zh: '处理照片出错，请重试。' },

  // ─── Pack Detail ───
  'packDetail.name': { en: 'Name', zh: '名称' },
  'packDetail.desc': { en: 'Description', zh: '描述' },
  'packDetail.noDesc': { en: 'No description', zh: '无描述' },
  'packDetail.learnInOrder': { en: 'Learn in order', zh: '按顺序学习' },
  'packDetail.paused': { en: 'Paused', zh: '已暂停' },
  'packDetail.stopPracticing': { en: 'Stop practicing this pack', zh: '停止练习此词包' },
  'packDetail.removePack': { en: 'Remove this pack', zh: '移除此字卡包' },
  'packDetail.confirmRemove': { en: 'Tap again to confirm', zh: '再次点击确认' },
  'packDetail.sentences': { en: (n) => `Sentences (${n})`, zh: (n) => `句子 (${n})` },

  // ─── Word Detail ───
  'wordDetail.definition': { en: 'Definition', zh: '释义' },
  'wordDetail.pinyin': { en: 'Pinyin', zh: '拼音' },
  'wordDetail.example': { en: 'Example', zh: '例子' },
  'wordDetail.examplePlaceholder': { en: 'e.g. 大象, big elephant', zh: '例如：大象，大的动物' },
  'wordDetail.radical': { en: 'Radical:', zh: '部首：' },
  'wordDetail.strokes': { en: 'strokes', zh: '笔画' },
  'wordDetail.added': { en: 'Added', zh: '添加时间' },
  'wordDetail.status': { en: 'Status', zh: '状态' },
  'wordDetail.box': { en: 'Progress', zh: '进度' },
  'wordDetail.boxN': {
    en: (n) => ['', 'New', 'Learning', 'Familiar', 'Strong', 'Mastered'][n] || `${n} / 5`,
    zh: (n) => ['', '新学', '练习中', '熟悉', '巩固', '已掌握'][n] || `${n} / 5`,
  },
  'wordDetail.practiced': { en: 'Practiced', zh: '练习次数' },
  'wordDetail.streak': { en: 'Correct in a row', zh: '连续正确' },
  'wordDetail.lastPracticed': { en: 'Last practiced', zh: '上次练习' },
  'wordDetail.never': { en: 'Not yet', zh: '尚未练习' },

  // ─── Mastery labels ───
  'mastery.learning': { en: 'Learning', zh: '学习中' },
  'mastery.practicing': { en: 'Practicing', zh: '练习中' },
  'mastery.mastered': { en: 'Mastered', zh: '已掌握' },

  // ─── Session ───
  'session.resume': { en: 'Ready to keep going?', zh: '准备好继续了吗？' },
  'session.continue': { en: 'Continue practicing', zh: '继续练习' },
  'session.quit': { en: 'Quit session', zh: '退出练习' },
  'session.keepPracticing': { en: 'Keep practicing', zh: '继续练习' },
  'session.allDone': { en: 'All done!', zh: '完成！' },

  // ─── Celebration (growth-mindset, 20 varieties) ───
  'celebrate.dragonEffort': { en: (n) => `${n} words — you worked so hard!`, zh: (n) => `${n} 个字 — 真努力！` },
  'celebrate.practiced': { en: (n) => `You practiced ${n} words today`, zh: (n) => `今天练了 ${n} 个字` },
  'celebrate.stuckWithIt': { en: (n) => `${n} words — you stuck with it!`, zh: (n) => `${n} 个字 — 坚持到底！` },
  'celebrate.growing': { en: (n) => `${n} words — your brain is growing!`, zh: (n) => `${n} 个字 — 大脑在成长！` },
  'celebrate.focused': { en: (n) => `${n} words — great focus today!`, zh: (n) => `${n} 个字 — 今天好专注！` },
  'celebrate.brainGrew': { en: (n) => `${n} words — you learned something new!`, zh: (n) => `${n} 个字 — 又学到新东西！` },
  'celebrate.hardWork': { en: (n) => `${n} words — hard work pays off!`, zh: (n) => `${n} 个字 — 功夫不负有心人！` },
  'celebrate.neverGaveUp': { en: (n) => `${n} words — you never gave up!`, zh: (n) => `${n} 个字 — 从不放弃！` },
  'celebrate.blastOff': { en: (n) => `${n} words — ready for liftoff!`, zh: (n) => `${n} 个字 — 准备起飞！` },
  'celebrate.colorful': { en: (n) => `${n} words — what a colorful session!`, zh: (n) => `${n} 个字 — 多彩的一课！` },
  'celebrate.brave': { en: (n) => `${n} words — brave work today!`, zh: (n) => `${n} 个字 — 今天真勇敢！` },
  'celebrate.artist': { en: (n) => `${n} words — every stroke counts!`, zh: (n) => `${n} 个字 — 每一笔都算数！` },
  'celebrate.blooming': { en: (n) => `${n} words — you're blooming!`, zh: (n) => `${n} 个字 — 正在开花！` },
  'celebrate.shining': { en: (n) => `${n} words — look at you shine!`, zh: (n) => `${n} 个字 — 你在发光！` },
  'celebrate.rhythm': { en: (n) => `${n} words — you found your rhythm!`, zh: (n) => `${n} 个字 — 找到节奏了！` },
  'celebrate.puzzle': { en: (n) => `${n} words — piece by piece!`, zh: (n) => `${n} 个字 — 一点一点拼起来！` },
  'celebrate.climbing': { en: (n) => `${n} words — one step higher!`, zh: (n) => `${n} 个字 — 又高了一步！` },
  'celebrate.steady': { en: (n) => `${n} words — slow and steady!`, zh: (n) => `${n} 个字 — 稳扎稳打！` },
  'celebrate.stronger': { en: (n) => `${n} words — getting stronger!`, zh: (n) => `${n} 个字 — 越来越强！` },
  'celebrate.focused2': { en: (n) => `${n} words — nice concentration!`, zh: (n) => `${n} 个字 — 注意力真好！` },

  // ─── Activities ───
  'activity.hint': { en: 'Hint', zh: '提示' },
  'activity.hintAudio': { en: '🔊 Hint', zh: '🔊 提示' },
  'activity.skip': { en: 'skip ›', zh: '跳过 ›' },
  'activity.radical': { en: 'Radical — a building block!', zh: '部首 — 汉字积木！' },
  'activity.replay': { en: '↻ Replay', zh: '↻ 重放' },
  'activity.continue': { en: 'Continue', zh: '继续' },

  // ─── Matching game ───
  'matching.matchMeaning': { en: 'Match each character to its meaning', zh: '将每个字与意思配对' },
  'matching.matchPinyin': { en: 'Match each character to its pinyin', zh: '将每个字与拼音配对' },

  // ─── Pack milestones ───
  'milestone.halfway': { en: 'Halfway There!', zh: '已经一半了！' },
  'milestone.complete': { en: 'Pack Complete!', zh: '全部完成！' },
  'milestone.halfwayDesc': { en: (name) => `You've mastered half the words in ${name}!`, zh: (name) => `你已经掌握了"${name}"一半的字！` },
  'milestone.completeDesc': { en: (name) => `You've mastered every word in ${name}!`, zh: (name) => `你掌握了"${name}"所有的字！` },
  'milestone.continue': { en: 'Keep Going!', zh: '继续加油！' },

  // ─── Timed challenge ───
  'timed.title': { en: 'Speed Challenge!', zh: '速度挑战！' },
  'timed.desc': { en: 'Write as many characters as you can in 60 seconds!', zh: '60秒内写出尽可能多的汉字！' },
  'timed.start': { en: 'Ready, Set, Go!', zh: '准备，开始！' },
  'timed.written': { en: 'written', zh: '已写' },
  'timed.skip': { en: 'skip ›', zh: '跳过 ›' },
  'timed.resultsTitle': { en: 'Time\'s up!', zh: '时间到！' },
  'timed.resultsDesc': { en: (n) => `You wrote ${n} character${n !== 1 ? 's' : ''}!`, zh: (n) => `你写了 ${n} 个字！` },
  'timed.done': { en: 'Done', zh: '完成' },

  // ─── Quiz prompts ───
  'quiz.whichChar': { en: 'Which character did you hear?', zh: '你听到了哪个字？' },
  'quiz.whatMeans': { en: 'What does this mean?', zh: '这是什么意思？' },
  'quiz.whichPinyin': { en: 'Which pinyin matches?', zh: '哪个拼音对？' },
  'quiz.whichCharMeans': { en: 'Which character means:', zh: '哪个字的意思是：' },

  // ─── Quiz feedback ───
  'quiz.tryAgain': { en: 'Try again!', zh: '再试一次！' },
  'quiz.almost': { en: 'Almost!', zh: '差一点！' },
  'quiz.keepTrying': { en: 'Keep trying!', zh: '继续加油！' },

  // ─── Writing activities ───
  'write.trace': { en: 'Trace the strokes', zh: '描写笔画' },
  'write.traceHint': { en: 'Follow the guide — tap each stroke in order', zh: '跟着提示，按顺序点每一笔' },
  'write.write': { en: 'Write the character', zh: '写这个字' },
  'write.writeHint': { en: 'Use the outline as a guide', zh: '看着轮廓写' },
  'write.watchWrite': { en: 'Watch, then write!', zh: '看一遍，再写！' },
  'write.watchHint': { en: 'Watch carefully, then write from memory', zh: '仔细看，然后凭记忆写' },
  'write.listenWrite': { en: 'Listen and write', zh: '听写' },
  'write.listenHint': { en: 'Listen to the word, then write it', zh: '听词语，然后写出来' },
  'write.showHint': { en: 'Show hint', zh: '显示提示' },
  'write.hintUsed': { en: 'Hint used', zh: '已使用提示' },
  'write.perfect': { en: 'Nailed it!', zh: '写对了！' },
  'write.wellDone': { en: 'Nice work!', zh: '做得好！' },
  'write.goodEffort': { en: 'Good try — keep at it!', zh: '不错的尝试，继续加油！' },

  // ─── Toast messages ───
  'toast.removed': { en: (title) => `Removed "${title}"`, zh: (title) => `已移除「${title}」` },
  'toast.created': { en: (title, n) => `Created "${title}" with ${n} word${n !== 1 ? 's' : ''}`, zh: (title, n) => `已创建「${title}」，${n} 个字` },
  'toast.added': { en: (title, added, skipped) => `Added "${title}" — ${added} new words${skipped ? ', ' + skipped + ' already known' : ''}`, zh: (title, added, skipped) => `已添加「${title}」— ${added} 个新字${skipped ? '，' + skipped + ' 个已有' : ''}` },
  'toast.deleted': { en: (ch) => `Deleted ${ch}`, zh: (ch) => `已删除 ${ch}` },
  'toast.starred': { en: (ch) => `★ Starred ${ch}`, zh: (ch) => `★ 已标记 ${ch}` },
  'toast.unstarred': { en: (ch) => `☆ Unstarred ${ch}`, zh: (ch) => `☆ 取消标记 ${ch}` },
  'toast.linkCopied': { en: 'Share link copied!', zh: '分享链接已复制！' },

  // ─── Delete Profile ───
  'delete.tapConfirm': { en: 'Tap to confirm', zh: '点击确认' },

  // ─── Settings ───
  'settings.gatePrompt': { en: (a, b) => `What is ${a} + ${b}?`, zh: (a, b) => `${a} + ${b} = ?` },
  'settings.gateCheck': { en: 'Check', zh: '确认' },
  'settings.gateWrong': { en: 'Try again!', zh: '再试一次！' },
  'settings.title': { en: 'Parents', zh: '家长' },
  'settings.language': { en: 'Language', zh: '语言' },
  'settings.theme': { en: 'Theme', zh: '主题' },
  'settings.light': { en: 'Light', zh: '浅色' },
  'settings.dark': { en: 'Dark', zh: '深色' },
  'settings.export': { en: 'Export Data', zh: '导出数据' },
  'settings.import': { en: 'Import Data', zh: '导入数据' },
  'settings.exportDesc': { en: 'Download all profiles and word lists as a file.', zh: '下载所有档案和生字表。' },
  'settings.importDesc': { en: 'Restore from a previously exported file.', zh: '从之前导出的文件恢复。' },
  'settings.exported': { en: 'Data exported!', zh: '已导出数据！' },
  'settings.importSuccess': { en: (n) => `Imported ${n} profile${n !== 1 ? 's' : ''} successfully!`, zh: (n) => `成功导入 ${n} 个档案！` },
  'settings.importError': { en: 'Invalid file. Please use an exported XieXie file.', zh: '文件无效。请使用写写导出的文件。' },
  'settings.importMerge': { en: 'Same-name profiles will be merged. Words keep the most advanced progress.', zh: '同名档案将合并，生字保留最高进度。' },
  'settings.dashboard': { en: 'Kid Dashboard', zh: '学习报告' },
  'dashboard.editProfile': { en: 'Edit Profile', zh: '编辑档案' },
  'settings.deleteProfile': { en: 'Manage Profiles', zh: '管理档案' },
  'dashboard.deleteProfile': { en: 'Delete Profile', zh: '删除档案' },
  'dashboard.deleteConfirm': { en: 'Tap again to confirm', zh: '再次点击确认' },

  // ─── Word Editor extras ───
  'words.testMode': { en: 'Test Mode', zh: '听写测试' },
  'words.dashboard': { en: 'Dashboard', zh: '学习报告' },
  'words.share': { en: 'Share', zh: '分享' },
  'words.linkCopied': { en: 'Link copied to clipboard!', zh: '链接已复制！' },

  // ─── Test Mode ───
  'test.title': { en: 'Dictation Test', zh: '听写测试' },
  'test.builderDesc': { en: 'Select words for your test. Tap to toggle.', zh: '选择测试的生字，点击切换。' },
  'test.selectAll': { en: 'All', zh: '全部' },
  'test.selectReady': { en: 'Ready', zh: '已掌握' },
  'test.selectStarred': { en: 'Starred', zh: '星标' },
  'test.selectNone': { en: 'Clear', zh: '清除' },
  'test.filterLearning': { en: 'Learning', zh: '学习中' },
  'test.filterMastered': { en: 'Mastered', zh: '已掌握' },
  'test.start': { en: (n) => `Start Test (${n} words)`, zh: (n) => `开始测试（${n}个字）` },
  'test.listenAndWrite': { en: 'Listen and write the character', zh: '听写' },
  'test.resultSummary': { en: (c, t) => `${c} out of ${t} correct`, zh: (c, t) => `${t}个字中写对了${c}个` },
  'test.gotThese': { en: 'Got these right', zh: '写对了' },
  'test.practiceThese': { en: 'Practice these more', zh: '需要多练' },
  'test.practiceWrong': { en: 'Practice missed words', zh: '练习写错的字' },
  'test.backToWords': { en: 'Back to words', zh: '返回生字' },

  // ─── Dashboard ───
  'dashboard.calendar': { en: 'Activity', zh: '练习日历' },
  'dashboard.title': { en: 'Progress', zh: '学习报告' },
  'dashboard.noWords': { en: 'No words added yet. Add some word packs to get started!', zh: '还没有添加生字。先添加生字包吧！' },
  'dashboard.excellent': { en: (name, pct) => `${name} is doing amazing! ${pct}% of words mastered.`, zh: (name, pct) => `${name}学得真棒！${pct}%的字已掌握。` },
  'dashboard.goodProgress': { en: (name, pct) => `${name} is making great progress! ${pct}% mastered so far.`, zh: (name, pct) => `${name}进步很大！已掌握${pct}%。` },
  'dashboard.keepGoing': { en: (name, n) => `${name} is working on ${n} characters. Keep practicing!`, zh: (name, n) => `${name}正在学习${n}个字，继续加油！` },
  'dashboard.justStarted': { en: (name, n) => `${name} just started with ${n} characters. Let's go!`, zh: (name, n) => `${name}刚开始学习${n}个字，加油！` },
  'dashboard.totalWords': { en: 'Total Words', zh: '总字数' },
  'dashboard.mastered': { en: 'Mastered', zh: '已掌握' },
  'dashboard.sessions': { en: 'Sessions', zh: '练习次数' },
  'dashboard.streak': { en: 'In a Row', zh: '连续完成' },
  'dashboard.boxBreakdown': { en: 'Learning Progress', zh: '学习进度' },
  'dashboard.box': {
    en: (n) => ['', 'New', 'Learning', 'Familiar', 'Strong', 'Mastered'][n] || `Level ${n}`,
    zh: (n) => ['', '新学', '练习中', '熟悉', '巩固', '已掌握'][n] || `第${n}级`,
  },
  'dashboard.troubleChars': { en: 'Needs More Practice', zh: '需要多练的字' },
  'dashboard.attempts': { en: 'tries', zh: '次' },
  'dashboard.recentlyMastered': { en: 'Recently Mastered', zh: '最近掌握的字' },
  'dashboard.testHistory': { en: 'Test History', zh: '测试记录' },
  'dashboard.levelInfo': { en: 'Difficulty Level', zh: '难度等级' },
  'dashboard.currentLevel': { en: (n) => `Currently at Level ${n}`, zh: (n) => `当前等级：${n}` },
  'dashboard.levelDesc': { en: 'Higher levels introduce harder activities like writing from memory. The app adjusts automatically based on how well your child is doing.', zh: '更高等级会引入更难的活动，如凭记忆写字。应用会根据孩子的表现自动调整。' },
  'dashboard.lockLevel': { en: 'Lock level', zh: '锁定等级' },
  'dashboard.lockDesc': { en: 'Prevent the app from changing the difficulty automatically.', zh: '防止应用自动调整难度。' },
  'dashboard.levelChange': { en: (from, to) => `Level ${from} → ${to}`, zh: (from, to) => `等级 ${from} → ${to}` },

  // ─── Printable Worksheets ───
  'dashboard.printWorksheet': { en: 'Practice Worksheet', zh: '练习工作表' },
  'dashboard.printDesc': { en: 'Generate a printable worksheet for characters that need more practice.', zh: '生成需要多练的字的打印工作表。' },
  'dashboard.print': { en: 'Print practice sheets', zh: '打印练习纸' },
  'dashboard.printing': { en: 'Generating...', zh: '生成中...' },
  'dashboard.noWordsToPrint': { en: 'No words need practice!', zh: '没有需要练习的字！' },
  'worksheet.title': { en: 'Practice Sheet', zh: '练习纸' },
  'worksheet.parentTip': { en: 'Tip: Say each word aloud before your child writes it.', zh: '提示：让孩子写之前先大声读出每个字。' },
  'worksheet.heading': { en: 'Heading', zh: '标题' },
  'worksheet.gridSize': { en: 'Grid size', zh: '格子大小' },
  'worksheet.small': { en: 'Small', zh: '小' },
  'worksheet.medium': { en: 'Medium', zh: '中' },
  'worksheet.large': { en: 'Large', zh: '大' },
  'worksheet.repeatCount': { en: 'Practice times', zh: '练习次数' },
  'worksheet.includeStrokes': { en: 'Show trace guides (first 2 cells)', zh: '显示描红（前2格）' },
  'worksheet.needsPractice': { en: 'Needs practice', zh: '需要练习' },

  // ─── Character Garden ───
  'dashboard.garden': { en: 'Character Garden', zh: '汉字花园' },
  'dashboard.gardenEmpty': { en: 'Master characters to grow your garden!', zh: '掌握更多汉字来种花吧！' },
};

let currentLang = null;

/** Get the current language. Defaults to 'en'. */
export function getLang() {
  if (currentLang) return currentLang;
  try {
    currentLang = localStorage.getItem(PREFIX + 'lang') || 'en';
  } catch {
    currentLang = 'en';
  }
  return currentLang;
}

/** Set the UI language and persist. */
export function setLang(lang) {
  currentLang = lang;
  try {
    localStorage.setItem(PREFIX + 'lang', lang);
  } catch {}
}

/**
 * Get a translated string by key.
 * If the value is a function, return the function (caller provides args).
 * If the value is a string, return it directly.
 * Falls back to English if key/lang missing.
 */
export function t(key, ...args) {
  const entry = strings[key];
  if (!entry) return key;
  const lang = getLang();
  const val = entry[lang] || entry.en;
  if (typeof val === 'function') return val(...args);
  return val;
}
