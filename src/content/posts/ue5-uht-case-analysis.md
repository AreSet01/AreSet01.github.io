---
title: "UE5 反射系统与底层架构深度解析（番外）：从代码简要解析generated.h，gen.cpp文件"
description: "从代码层面解析 Unreal Header Tool（UHT）生成的 .generated.h 和 .gen.cpp 文件，深入理解虚幻引擎反射系统的底层原理与设计哲学。"
pubDate: 2026-09-29
tags: ["Unreal Engine", "UE5", "UHT", "反射系统", "C++", "底层原理"]
category: "引擎开发"
series: "UE5 反射系统与底层架构深度解析"
seriesOrder: 6
draft: false
---

## 前言



---

## 源代码

### 1.Dream_GameModeBase.h

```cpp 
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "Dream_GameModeBase.generated.h"

UCLASS()
class DREAM_API ADreamGameModeBase : public AGameModeBase
{
	GENERATED_BODY()
	
public:
	ADreamGameModeBase();
};
```

### 2.Dream_GameModeBase.cpp

```cpp 
#include "Core/Dream_GameModeBase.h"
#include "Core/Dream_PlanePawn.h"
#include "Core/Dream_PlayerController.h"
ADreamGameModeBase::ADreamGameModeBase()
{
	PlayerControllerClass = ADreamPlayerController::StaticClass();

	DefaultPawnClass = ADreamPlanePawn::StaticClass();
}
```

## UHT生成代码

### 1.Dream_GameModeBase.generated.h

```cpp
#ifdef DREAM_Dream_GameModeBase_generated_h
#error "Dream_GameModeBase.generated.h already included, missing '#pragma once' in Dream_GameModeBase.h"
#endif

// 防止同一个头文件被重复包含
#define DREAM_Dream_GameModeBase_generated_h

#include "UObject/ObjectMacros.h"
#include "UObject/ScriptMacros.h"

// 防止编译器对过时、废弃的代码（api）发出警告
// 虚幻UBT对所有警告都默认报错中断
PRAGMA_DISABLE_DEPRECATION_WARNINGS

// Begin Class ADreamGameModeBase
// 静态数据容器
// 存放：依赖项清单，编辑器元数据，C++类型特征，参数大汇总
// 然后交予Z_Construct_UClass_ADreamGameModeBase中分配内存
struct Z_Construct_UClass_ADreamGameModeBase_Statics;

// DREAM_API：
// 项目专属宏，游戏逻辑会被编译成UnrealEditor-Dream.dll
// 自我编译时，展开为__declspec(dllexport)(向外导出，公开给别人用)
// 被引用编译时，__declspec(dllimport)(从别的DLL导入)

// Z_Construct_UClass_ADreamGameModeBase_NoRegister
DREAM_API UClass* Z_Construct_UClass_ADreamGameModeBase_NoRegister();

// INCLASS(类内声明)，NO_PURE_DECLS(非纯声明)
// 声明类内的静态成员函数，供构造函数模块使用，必须注入到class内部的代码
// 反射与类型系统专属模块
#define FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h_15_INCLASS_NO_PURE_DECLS \
private: \
  // 把C++函数指针注册给蓝图虚拟机
	static void StaticRegisterNativesADreamGameModeBase(); \
  // 友元创建，让反射构造器可以访问类的私有静态指针
	friend struct ::Z_Construct_UClass_ADreamGameModeBase_Statics; \
	// 懒加载创建单例对象
	static UClass* GetPrivateStaticClass(); \
	// 跨模块轻量查询，通过这个访问GetPrivateStaticClass
	// 因为是外部全局函数，所以要友元声明
	friend DREAM_API UClass* ::Z_Construct_UClass_ADreamGameModeBase_NoRegister(); \
public: \
  // 核心能力总成(类型别名、公开静态获取器与快速类型转换)
  // 生成typedef XXX ThisClass
  // 生成typedef XXX父类 Super
  // 生成StaticClass()供以获取类型元数据
  // 为Cast<XXX>(Obj)提供底层快速位掩码(CASTCLASS_None：底层枚举EClassCastFlags)
	DECLARE_CLASS2(ADreamGameModeBase, AGameModeBase, COMPILED_IN_FLAGS(0 | CLASS_Transient | CLASS_Config), CASTCLASS_None, TEXT("/Script/Dream"), Z_Construct_UClass_ADreamGameModeBase_NoRegister) \

	// 注入虚幻专用的存盘与网络同步接口，重载输入输出流操作符
	// friend FArchive& operator<<(FArchive& Ar, XXX*& Res);
	DECLARE_SERIALIZER(ADreamGameModeBase)

// C++语法与生命周期安全模块
// 规范C++对象构造规则，禁止移动构造和拷贝构造
#define FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h_15_ENHANCED_CONSTRUCTORS \
	/** Deleted move- and copy-constructors, should never be used */ \
	// 删除非法拷贝与移动，防止对象不被GC监测
	ADreamGameModeBase(ADreamGameModeBase&&) = delete; \
	ADreamGameModeBase(const ADreamGameModeBase&) = delete; \

	// 热重载核心支持：虚表指针修复构造器
	
	// 在类内部负责【声明】
	// 展开之后 XXX(FVTableHelper& Helper);
	// 利用辅助构造函数，完全不重新执行构造函数业务逻辑的情况下，把对象内存头部“虚表指针重定向到新DLL虚表“
	DECLARE_VTABLE_PTR_HELPER_CTOR(NO_API, ADreamGameModeBase); \
	
	// 在类内部生成【静态调用桩】
	// 展开之后 static UObject* __VTableCtorCaller(FVTableHelper& Helper)
	// return new (EC_InternalUseOnlyConstructor, ...) XXX(Helper);利用placement new在已有内存上触发构造函数
	DEFINE_VTABLE_PTR_HELPER_CTOR_CALLER(ADreamGameModeBase); \

	// 默认构造函数调用桩
	// 蓝图调用SpawnActor或C++中调用NewObject<T>()时，通过这个来new
	// 生成静态函数桩
	DEFINE_DEFAULT_CONSTRUCTOR_CALL(ADreamGameModeBase) \

	// 虚析构函数，防泄漏
	NO_API virtual ~ADreamGameModeBase();

// 行号是UCLASS()
// 为了让UHT能识别且C++编译器不报错，所以把UCLASS()这玩意定义为展开为空....
// ObjectMacros.h 有定义 #define UCLASS(...) BODY_MACRO_COMBINE(CURRENT_FILE_ID, _, __LINE__, _PROLOG)
// CURRENT_FILE_ID，行号，_PROLOG拼接
// ...是C++ 预处理器的原生语法——可变参数宏
// PROLOG前言，作为class声明前的宏
#define FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h_12_PROLOG

// FID_...._：h代表着路径编码(File ID)
// 数字：代表着GENERATED_BODY的行号
// 总成宏，负责把反射模块和构造函数模块拼接
#define FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h_15_GENERATED_BODY \
PRAGMA_DISABLE_DEPRECATION_WARNINGS \
public: \
	FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h_15_INCLASS_NO_PURE_DECLS \
	FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h_15_ENHANCED_CONSTRUCTORS \
private: \
PRAGMA_ENABLE_DEPRECATION_WARNINGS


class ADreamGameModeBase;

// End Class ADreamGameModeBase

#undef CURRENT_FILE_ID
#define CURRENT_FILE_ID FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h

PRAGMA_ENABLE_DEPRECATION_WARNINGS

```

### 2.Dream_GameModeBase.gen.cpp

```cpp

#include "UObject/GeneratedCppIncludes.h"
#include "Core/Dream_GameModeBase.h"

PRAGMA_DISABLE_DEPRECATION_WARNINGS
static_assert(!UE_WITH_CONSTINIT_UOBJECT, "This generated code can only be compiled with !UE_WITH_CONSTINIT_OBJECT");
void EmptyLinkFunctionForGeneratedCodeDream_GameModeBase() {}

// Begin Cross Module References 
DREAM_API UClass* Z_Construct_UClass_ADreamGameModeBase();
DREAM_API UClass* Z_Construct_UClass_ADreamGameModeBase_NoRegister();
ENGINE_API UClass* Z_Construct_UClass_AGameModeBase();
UPackage* Z_Construct_UPackage__Script_Dream();
// End Cross Module References 

// Begin Class ADreamGameModeBase 
FClassRegistrationInfo Z_Registration_Info_UClass_ADreamGameModeBase;
UClass* ADreamGameModeBase::GetPrivateStaticClass()
{
	using TClass = ADreamGameModeBase;
	if (!Z_Registration_Info_UClass_ADreamGameModeBase.InnerSingleton)
	{
		GetPrivateStaticClassBody(
			TClass::StaticPackage(),
			TEXT("DreamGameModeBase"),
			Z_Registration_Info_UClass_ADreamGameModeBase.InnerSingleton,
			StaticRegisterNativesADreamGameModeBase,
			sizeof(TClass),
			alignof(TClass),
			TClass::StaticClassFlags,
			TClass::StaticClassCastFlags(),
			TClass::StaticConfigName(),
			(UClass::ClassConstructorType)InternalConstructor<TClass>,
			(UClass::ClassVTableHelperCtorCallerType)InternalVTableHelperCtorCaller<TClass>,
			UOBJECT_CPPCLASS_STATICFUNCTIONS_FORCLASS(TClass),
			&TClass::Super::StaticClass,
			&TClass::WithinClass::StaticClass
		);
	}
	return Z_Registration_Info_UClass_ADreamGameModeBase.InnerSingleton;
}
UClass* Z_Construct_UClass_ADreamGameModeBase_NoRegister()
{
	return ADreamGameModeBase::GetPrivateStaticClass();
}
struct Z_Construct_UClass_ADreamGameModeBase_Statics
{
    // 编辑器元数据键值对(Class_MetaDataParams[])
    // 让Uereal Editor在编辑器中显示类的相关信息(隐藏属性面板HideCategories，头文件路径，依赖路径)
    // 打包时会被剥离掉(WITH_METADATA)省内存
#if WITH_METADATA
	static constexpr UECodeGen_Private::FMetaDataPairParam Class_MetaDataParams[] = {
#if !UE_BUILD_SHIPPING
		{ "Comment", "/**\n * \n */" },
#endif
		{ "HideCategories", "Info Rendering MovementReplication Replication Actor Input Movement Collision Rendering HLOD WorldPartition DataLayers Transformation" },
		{ "IncludePath", "Core/Dream_GameModeBase.h" },
		{ "ModuleRelativePath", "Public/Core/Dream_GameModeBase.h" },
		{ "ShowCategories", "Input|MouseInput Input|TouchInput" },
	};
#endif // WITH_METADATA

// Begin Class ADreamGameModeBase constinit property declarations 

// End Class ADreamGameModeBase constinit property declarations 
	static UObject* (*const DependentSingletons[])();

    // 记录这个类在 C++ 层面是不是一个纯虚抽象类
    // True，蓝图和引擎禁止直接实例化
	static constexpr FCppClassTypeInfoStatic StaticCppClassTypeInfo = {
		TCppClassTypeTraits<ADreamGameModeBase>::IsAbstract,
	};

    // 将信息汇总+ClassFlags标志位(0x009002ACu)传递给ConstructUClass
	static const UECodeGen_Private::FClassParams ClassParams;
}; // struct Z_Construct_UClass_ADreamGameModeBase_Statics

// 函数指针，指向依赖的单例对象(父类和模块包)，用于在运行时获取这些对象的引用
UObject* (*const Z_Construct_UClass_ADreamGameModeBase_Statics::DependentSingletons[])() = {
    // 父类(AGameModeBase)
	(UObject* (*)())Z_Construct_UClass_AGameModeBase,
	// 所属模块包(Package)，虚拟对象路径(/Script/Dream)
    // Script：Ue顶级挂载点，用于存放所有C++原生代码编译出来的类、结构体和枚举
    // Dream：模块名
    (UObject* (*)())Z_Construct_UPackage__Script_Dream,
    // 内存中完整的对象路径：/Script/Dream.DreamGameModeBase
};
static_assert(UE_ARRAY_COUNT(Z_Construct_UClass_ADreamGameModeBase_Statics::DependentSingletons) < 16);
const UECodeGen_Private::FClassParams Z_Construct_UClass_ADreamGameModeBase_Statics::ClassParams = {
	&ADreamGameModeBase::StaticClass,
	"Game",
	&StaticCppClassTypeInfo,
	DependentSingletons,
	nullptr,
	nullptr,
	nullptr,
	UE_ARRAY_COUNT(DependentSingletons),
	0,
	0,
	0,
	0x009002ACu,
	METADATA_PARAMS(UE_ARRAY_COUNT(Z_Construct_UClass_ADreamGameModeBase_Statics::Class_MetaDataParams), Z_Construct_UClass_ADreamGameModeBase_Statics::Class_MetaDataParams)
};
void ADreamGameModeBase::StaticRegisterNativesADreamGameModeBase()
{
}

// 判断单例是否存在，如果不存在就触发构建
UClass* Z_Construct_UClass_ADreamGameModeBase()
{
	if (!Z_Registration_Info_UClass_ADreamGameModeBase.OuterSingleton)
	{

    // 构建UClass对象的函数
		UECodeGen_Private::ConstructUClass(Z_Registration_Info_UClass_ADreamGameModeBase.OuterSingleton, Z_Construct_UClass_ADreamGameModeBase_Statics::ClassParams);
	}
	return Z_Registration_Info_UClass_ADreamGameModeBase.OuterSingleton;
}

// 实现带有FVTableHelper& Helper的构造函数
// ADreamGameModeBase::ADreamGameModeBase(FVTableHelper& Helper) : Super(Helper) 
DEFINE_VTABLE_PTR_HELPER_CTOR_NS(, ADreamGameModeBase);
ADreamGameModeBase::~ADreamGameModeBase() {}
// End Class ADreamGameModeBase

// Begin Registration
struct Z_CompiledInDeferFile_FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h__Script_Dream_Statics
{
	static constexpr FClassRegisterCompiledInInfo ClassInfo[] = {
		{ Z_Construct_UClass_ADreamGameModeBase, ADreamGameModeBase::StaticClass, TEXT("ADreamGameModeBase"), &Z_Registration_Info_UClass_ADreamGameModeBase, CONSTRUCT_RELOAD_VERSION_INFO(FClassReloadVersionInfo, sizeof(ADreamGameModeBase), 2001584642U) },
	};
}; // Z_CompiledInDeferFile_FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h__Script_Dream_Statics 
static FRegisterCompiledInInfo Z_CompiledInDeferFile_FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h__Script_Dream_2698426432{
	TEXT("/Script/Dream"),
	Z_CompiledInDeferFile_FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h__Script_Dream_Statics::ClassInfo, UE_ARRAY_COUNT(Z_CompiledInDeferFile_FID_Dream_Source_Dream_Public_Core_Dream_GameModeBase_h__Script_Dream_Statics::ClassInfo),
	nullptr, 0,
	nullptr, 0,
};
// End Registration

PRAGMA_ENABLE_DEPRECATION_WARNINGS

```

## 部分概念

### 桩(Thunk)

问题：在new一个具体对象时，C++必须在编译时就知道具体类型。但是虚幻底层生成函数SpawnActor，NewObject等，只接收一个通用的UClass*指针，底层C++不可能提前#include项目中的头文件，也就是编译时无法得知这个类

于是乎便有了这个本质通用转接头的桩

引擎底层规定好统一且不依赖具体类型的函数指针格式：
```cpp
typedef UObject* (*ClassVTableHelperCtorCallerType)(FVTableHelper&);
```
而在generated.h内部知道具体类型之后，就写一个静态小函数：
```cpp
static UObject* __VTableCtorCaller(FVTableHelper& Helper）
{
  // EC_InternalUseOnlyConstructor(内部专用标记)内部枚举标记(EInternalUseOnlyConstructor)
  // C++重载operator new版本多
  // UObject重载了多个operator new，需要靠标记区分，直接new不允许
  // (UObject*)GetTransientPackage()(临时包指针)获取虚幻全局Transient Package
  // UObject诞生时必须挂载在父容器(Outer)名下，用完就丢
	return new (EC_InternalUseOnlyConstructor, (UObject*)GetTransientPackage()) ADreamGameModeBase(Helper);
}
```
因为标准C+没提供任何语法获取“虚函数表内存地址”，所以
```text
1. 引擎调用 __VTableCtorCaller
   └──> 2. 借助 FVTableHelper 快速在内存中 new 出一个临时的“工具人”假对象
          （因为函数体是空的，不执行任何游戏逻辑，开销极小且瞬间完成）
   └──> 3. C++ 编译器在 new 的瞬间，自动把【新虚表地址】填入了假对象的头部（vptr）
   └──> 4. 引擎偷偷从这个假对象头部把【新虚表地址】扣下来
   └──> 5. 引擎遍历内存中早已存在的活体对象，把它们头部的虚表指针批量替换成新地址
   └──> 6. 销毁假对象，完成热重载！
```
启动时，把桩函数地址&__VTableCtorCaller存进UClass属性，需要热重载时，拿出来直接调用函数指针，直接调用具体类的构造函数；

### NO_API

在宏定义展开后，NO_API 通常就是一个“空值（Empty）

1. 通用宏模板的"占位符"
```cpp
DECLARE_VTABLE_PTR_HELPER_CTOR(NO_API, ADreamGameModeBase);
// 定义原型：
// USE_VTABLE_PTR_HELPER_CTOR作为编译开关
// 编辑器/开发阶段时，为1，这段代码会进去，所以会有Live Coding热重载
// 在最终打包发布时，为0，宏展开为空白，即不编译这个
#if USE_VTABLE_PTR_HELPER_CTOR
    #define DECLARE_VTABLE_PTR_HELPER_CTOR(ApiMacro, ClassName)\
        ApiMacro ClassName(FVTableHelper& Helper);
#else
    #define DECLARE_VTABLE_PTR_HELPER_CTOR(ApiMacro, ClassName)
#endif
```

第一个参数要求传一个"导出宏"：

属于引擎核心模块，且该构造函数必须暴露给其他DLL使用，会传入ENGINE_API(__declspec(dllexport)

不需要向外导出函数or不需要跨模块调用，通过NO_API来占位

2. 明确语义：不导出符号

NO_API：展开为空白，表示本地私有/模块内自用，绝不把符号公开到 DLL 导出表，只在本模块内部可用

### 反射宏设计

很多时候源码中定义了很多Ue的反射类，这些UHT能识别，但是C++编译器是不通过的，所以需要一个空的宏定义来让其接受这些反射类

如果反射宏()内有内容，则由UHT翻译成静态数据写入gen.cpp和反射标志位中

1. 变成运行时的二进制标志位(ClassFlags)

决定这个类在游戏运行时的底层行为规则，会被UHT编译成一个32位整型掩码

```cpp
	DECLARE_CLASS2(ADreamGameModeBase, AGameModeBase, COMPILED_IN_FLAGS(0 | CLASS_Transient | CLASS_Config), CASTCLASS_None, TEXT("/Script/Dream"), Z_Construct_UClass_ADreamGameModeBase_NoRegister) \
```

这里的CLASS_Transient ｜ CLASS_Config 就是读取类修饰词后直接硬编码写入的标志位

- Abstract：将类标记为抽象类，禁止任何人在游戏里直接实例化它
- Transient：瞬态类，告诉引擎这个类的对象永远不要被存盘或保存到关卡资产中
- Config = Game：指定该类拥有读取和保存配置文件的能力（对应 Saved/Config/Windows/Game.ini）
- DefaultConfig：类的配置必须写入默认配置文件

```cpp
0x009002ACu
```

这个16进制常数是由类标志位通过按位或（｜）运算计算得出的整型掩码

运行时使用：调用SpawnActor时，用位运算检查
```cpp
if (CurrentClass->HasAnyClassFlags(CLASS_Abstract))
{
    // 如果是抽象类，引擎直接中断生成并弹出警告
    return nullptr;
}
```

2. 变成编辑器元数据键值对表(MetaData)

给编辑器看的信息Key，与游戏逻辑运行无关，UHT将转变为静态键值对数组

```cpp
#if WITH_METADATA
static constexpr UECodeGen_Private::FMetaDataPairParam Class_MetaDataParams[] = {
#if !UE_BUILD_SHIPPING
	{ "Comment", "/**\n * \n */" },
#endif
	{ "HideCategories", "Info Rendering MovementReplication Replication Actor Input Movement Collision Rendering HLOD WorldPartition DataLayers Transformation" },
	{ "IncludePath", "Core/Dream_GameModeBase.h" },
	{ "ModuleRelativePath", "Public/Core/Dream_GameModeBase.h" },
	{ "ShowCategories", "Input|MouseInput Input|TouchInput" },
};
#endif // WITH_METADATA
```

- DisplayName = "玩家模式基类"：在蓝图搜索列表或类下拉框中显示的名字
- HideCategories = "Rendering Collision Input"：在细节面板（Details Panel）中隐藏不相关的属性分类
- ShowCategories = "Input|MouseInput"：强制显示某些特定分类
- ToolTip = "..."：鼠标悬停在类名上时弹出的注释提示（UHT 甚至会自动抓取你写在类上方的 C++ /** ... */ 注释自动转成这个）

3. 引擎架构的路由配置

定义了该类在虚幻对象层级体系中的组织归宿

```cpp
UObject* (*const Z_Construct_UClass_ADreamGameModeBase_Statics::DependentSingletons[])() = {
	(UObject* (*)())Z_Construct_UClass_AGameModeBase,
	(UObject* (*)())Z_Construct_UPackage__Script_Dream,
};
```

UHT 把类与父类（AGameModeBase）以及专属包（UPackage__Script_Dream）的构造函数指针捆绑成依赖链条，保证在构建这个类之前，父类和父包必须先存在

- Within = Engine：规定该类的实例必须依附于某类特定的外部对象（Outer），不能随意挂载
- 模块与包路径：UHT 根据该类所在的文件夹目录，自动推导出它所属的虚拟包路径 /Script/Dream
